import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { compare, hash } from "bcryptjs";
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { DataSource, IsNull, QueryFailedError, Repository } from "typeorm";
import { AuthToken, AuthTokenPurpose } from "./auth-token.entity";
import { EmailDeliveryService } from "./email-delivery.service";
import { AuthenticatedUser } from "./auth.types";
import { RefreshSession } from "./refresh-session.entity";
import { LoginDto } from "./dto/login.dto";
import {
  BootstrapSuperadminDto,
  RegisterDto,
  RegisterEmployerDto,
} from "./dto/register.dto";
import { EmployerApprovalStatus, User, UserRole } from "../users/user.entity";
import { EmployerOrganization } from "../employers/organization.entity";
import {
  EmployerOrganizationMember,
  OrganizationMemberRole,
} from "../employers/organization-member.entity";
import { AuditService } from "../audit/audit.service";
import { SmsDeliveryService } from "./sms-delivery.service";
import { PlatformConfigurationService } from "../platform-config/platform-configuration.service";
import { SuperadminMfaService } from "./superadmin-mfa.service";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshSession)
    private readonly sessionsRepository: Repository<RefreshSession>,
    @InjectRepository(AuthToken)
    private readonly tokensRepository: Repository<AuthToken>,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly smsDelivery: SmsDeliveryService,
    private readonly auditService: AuditService,
    private readonly platformConfiguration: PlatformConfigurationService,
    private readonly superadminMfa: SuperadminMfaService,
  ) {}

  async publicConfiguration() {
    const configuration = await this.platformConfiguration.get();
    return {
      googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || null,
      candidateRegistrationEnabled: configuration.candidateRegistrationEnabled,
      employerRegistrationEnabled: configuration.employerRegistrationEnabled,
      employerApprovalRequired: configuration.employerApprovalRequired,
      jobCategories: configuration.jobCategories,
      industries: configuration.industries,
      locations: configuration.locations,
      employmentTypes: configuration.employmentTypes,
      workplaceTypes: configuration.workplaceTypes,
    };
  }

  async registerCandidate(dto: RegisterDto): Promise<{
    id: number;
    email: string;
    phoneNumber: string;
    message: string;
  }> {
    await this.platformConfiguration.assertRegistrationEnabled("candidate");
    const email = this.normalizeEmail(dto.email);
    await this.smsDelivery.assertConfigured();
    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber);
    if (Buffer.byteLength(dto.password, "utf8") > 72) {
      throw new BadRequestException(
        "Password must be no longer than 72 UTF-8 bytes",
      );
    }
    if (await this.usersRepository.findOneBy({ email })) {
      throw new ConflictException("An account with this email already exists");
    }

    if (await this.usersRepository.findOneBy({ phoneE164: phoneNumber })) {
      throw new ConflictException(
        "That phone number is already associated with an account.",
      );
    }

    const user = this.usersRepository.create({
      email,
      passwordHash: await hash(dto.password, 12),
      displayName: dto.displayName.trim(),
      role: UserRole.CANDIDATE,
      phoneE164: phoneNumber,
      phoneVerified: false,
    });
    const saved = await this.usersRepository.save(user);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.issueOtp(saved, code, "phone_verification", phoneNumber);
    let phoneCodeSent = true;
    try {
      await this.smsDelivery.sendVerificationCode(phoneNumber, code);
    } catch (error) {
      phoneCodeSent = false;
      this.logger.error(
        `Candidate registration SMS delivery failed for user ${saved.id}: ${
          error instanceof Error ? error.message : "unknown SMS delivery error"
        }`,
      );
    }
    await this.auditService.record({
      actorUserId: saved.id,
      action: "auth.candidate_registered",
      targetType: "user",
      targetId: saved.id,
      details: { role: saved.role },
    });
    let emailLinkSent = true;
    try {
      await this.sendVerification(saved);
    } catch (error) {
      emailLinkSent = false;
      this.logger.error(
        `Candidate registration verification email failed for user ${saved.id}: ${
          error instanceof Error ? error.message : "unknown delivery error"
        }`,
      );
    }
    return {
      id: saved.id,
      email: saved.email,
      phoneNumber,
      message:
        emailLinkSent && phoneCodeSent
          ? "Account created. Verify your email using the link we sent and enter the SMS code before signing in."
          : !emailLinkSent && !phoneCodeSent
            ? "Account created, but we could not send the verification email or SMS code. Use the email and SMS resend options on this page before signing in."
            : !emailLinkSent
              ? "Account created and the SMS code was sent, but the verification email could not be sent. Use the resend email verification option before signing in."
              : "Account created. Verify your email using the link we sent. The SMS could not be sent; use the resend code option before signing in.",
    };
  }

  async bootstrapSuperadminStatus(): Promise<{ available: boolean }> {
    const configuredEmail = process.env.SUPERADMIN_EMAIL?.trim();
    const configuredName = process.env.SUPERADMIN_NAME?.trim();
    const configuredPassword = process.env.SUPERADMIN_PASSWORD;
    if (
      !configuredEmail ||
      !configuredName ||
      !configuredPassword ||
      Buffer.byteLength(configuredPassword, "utf8") > 72
    ) {
      return { available: false };
    }
    const existing = await this.usersRepository.countBy({
      role: UserRole.SUPERADMIN,
    });
    return { available: existing === 0 };
  }

  async bootstrapSuperadmin(
    dto: BootstrapSuperadminDto,
  ): Promise<{ email: string }> {
    const configuredEmail = process.env.SUPERADMIN_EMAIL?.trim();
    const configuredName = process.env.SUPERADMIN_NAME?.trim();
    const configuredPassword = process.env.SUPERADMIN_PASSWORD;
    if (!configuredEmail || !configuredName || !configuredPassword) {
      throw new NotFoundException("Superadmin setup is not available.");
    }

    const email = this.normalizeEmail(dto.email);
    if (
      email !== this.normalizeEmail(configuredEmail) ||
      dto.displayName.trim() !== configuredName
    ) {
      throw new UnauthorizedException(
        "Enter the superadmin name and email configured for this deployment.",
      );
    }

    const receivedPasswordHash = createHash("sha256")
      .update(dto.password)
      .digest();
    const configuredPasswordHash = createHash("sha256")
      .update(configuredPassword)
      .digest();
    if (!timingSafeEqual(receivedPasswordHash, configuredPasswordHash)) {
      throw new UnauthorizedException(
        "The password does not match the superadmin password configured for this deployment.",
      );
    }

    const passwordBytes = Buffer.byteLength(dto.password, "utf8");
    if (passwordBytes > 72) {
      throw new BadRequestException(
        "Password must be no longer than 72 UTF-8 bytes.",
      );
    }
    const passwordHash = await hash(dto.password, 12);
    const name = dto.displayName.trim();
    if (name.length < 2) {
      throw new BadRequestException("Name must contain at least 2 characters.");
    }

    const created = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock($1, $2)",
        [1_729_000_000, 11],
      );
      const users = manager.getRepository(User);
      if (await users.findOneBy({ role: UserRole.SUPERADMIN })) {
        throw new ConflictException(
          "A superadmin already exists. First-time setup is closed.",
        );
      }
      if (await users.findOneBy({ email })) {
        throw new ConflictException(
          "That email already belongs to an account.",
        );
      }
      return users.save(
        users.create({
          email,
          displayName: name,
          passwordHash,
          role: UserRole.SUPERADMIN,
          emailVerified: true,
          isActive: true,
        }),
      );
    });

    await this.auditService.record({
      actorUserId: created.id,
      action: "auth.superadmin_bootstrapped",
      targetType: "user",
      targetId: created.id,
      details: { role: created.role },
    });
    return { email };
  }

  async registerEmployer(dto: RegisterEmployerDto): Promise<{
    id: number;
    email: string;
    phoneNumber: string;
    message: string;
  }> {
    await this.platformConfiguration.assertRegistrationEnabled("employer");
    const email = this.normalizeEmail(dto.email);
    await this.smsDelivery.assertConfigured();
    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber);
    const companyName = dto.companyName?.trim();
    if (Buffer.byteLength(dto.password, "utf8") > 72) {
      throw new BadRequestException(
        "Password must be no longer than 72 UTF-8 bytes",
      );
    }
    if (!dto.invitationToken && !companyName) {
      throw new BadRequestException(
        "Company name is required when registering a new employer workspace.",
      );
    }
    if (await this.usersRepository.findOneBy({ email })) {
      throw new ConflictException("An account with this email already exists");
    }
    if (await this.usersRepository.findOneBy({ phoneE164: phoneNumber })) {
      throw new ConflictException(
        "That phone number is already associated with an account.",
      );
    }

    const user = this.usersRepository.create({
      email,
      passwordHash: await hash(dto.password, 12),
      displayName: dto.displayName.trim(),
      companyName: companyName || null,
      companyWebsite: dto.companyWebsite?.trim() || null,
      role: UserRole.EMPLOYER,
      employerApprovalStatus: EmployerApprovalStatus.PENDING,
      phoneE164: phoneNumber,
      phoneVerified: false,
    });
    const registration = await this.dataSource.transaction(async (manager) => {
      const savedUser = await manager.getRepository(User).save(user);
      const members = manager.getRepository(EmployerOrganizationMember);
      if (dto.invitationToken) {
        const member = await members
          .createQueryBuilder("member")
          .where("member.invitationTokenHash = :tokenHash", {
            tokenHash: this.hashToken(dto.invitationToken),
          })
          .andWhere("member.status = :status", { status: "invited" })
          .andWhere("member.invitationExpiresAt > :now", { now: new Date() })
          .setLock("pessimistic_write")
          .getOne();
        if (!member)
          throw new NotFoundException(
            "This company invitation is invalid or expired. Ask the company owner to resend it.",
          );
        if (member.email.toLowerCase() !== email)
          throw new BadRequestException(
            "Register with the email address this invitation was sent to.",
          );
        const organization = await manager
          .getRepository(EmployerOrganization)
          .findOneBy({ id: member.organizationId });
        if (!organization)
          throw new NotFoundException(
            "The company for this invitation no longer exists.",
          );
        savedUser.companyName = organization.name;
        savedUser.companyWebsite = organization.website;
        await manager.getRepository(User).save(savedUser);
        member.userId = savedUser.id;
        member.status = "active";
        member.invitationTokenHash = null;
        member.invitationExpiresAt = null;
        await members.save(member);
        return { user: savedUser, invited: true };
      }

      const organizations = manager.getRepository(EmployerOrganization);
      const organization = await organizations.save(
        organizations.create({
          name: companyName!,
          slug: `${this.slugify(companyName!)}-${savedUser.id}`,
          website: dto.companyWebsite?.trim() || null,
          industry: null,
          companySize: null,
          description: null,
          planKey: "free",
          subscriptionStatus: "free",
        }),
      );
      await members.save({
        organizationId: organization.id,
        userId: savedUser.id,
        email: savedUser.email,
        role: OrganizationMemberRole.OWNER,
        status: "active",
      });
      return { user: savedUser, invited: false };
    });
    const saved = registration.user;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.issueOtp(saved, code, "phone_verification", phoneNumber);
    let phoneCodeSent = true;
    try {
      await this.smsDelivery.sendVerificationCode(phoneNumber, code);
    } catch (error) {
      phoneCodeSent = false;
      this.logger.error(
        `Employer registration SMS delivery failed for user ${saved.id}: ${
          error instanceof Error ? error.message : "unknown SMS delivery error"
        }`,
      );
    }
    await this.auditService.record({
      actorUserId: saved.id,
      action: "auth.employer_registered",
      targetType: "user",
      targetId: saved.id,
      details: {
        role: saved.role,
        invited: registration.invited,
      },
    });
    let emailLinkSent = true;
    try {
      await this.sendVerification(saved);
    } catch (error) {
      emailLinkSent = false;
      this.logger.error(
        `Employer registration verification email failed for user ${saved.id}: ${
          error instanceof Error ? error.message : "unknown delivery error"
        }`,
      );
    }
    return {
      id: saved.id,
      email: saved.email,
      phoneNumber,
      message:
        emailLinkSent && phoneCodeSent
          ? registration.invited
            ? "Company invitation recorded. Verify your email and phone before using the workspace; employer publishing also requires administrator approval."
            : "Employer registration received. Verify your email and phone before using the workspace; employer publishing also requires administrator approval."
          : !emailLinkSent && !phoneCodeSent
            ? "Employer account created, but we could not send the verification email or SMS code. Use the email and SMS resend options on this page before signing in; publishing also requires administrator approval."
            : !emailLinkSent
              ? "Employer account created, but the verification email could not be sent. Use the resend email verification option before signing in; publishing also requires administrator approval."
              : "Account created. Verify your email, then request a new SMS code before signing in; publishing also requires administrator approval.",
    };
  }

  async login(dto: LoginDto): Promise<
    | {
        accessToken: string;
        refreshToken: string;
        user: AuthenticatedUser;
      }
    | { mfaRequired: true }
    | { mfaSetupRequired: true; setupToken: string }
  > {
    if (Buffer.byteLength(dto.password, "utf8") > 72) {
      await this.recordLoginFailure(null, "invalid_credentials");
      throw new UnauthorizedException("Email or password is incorrect");
    }
    const email = this.normalizeEmail(dto.email);
    const user = await this.usersRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.email = :email", { email })
      .getOne();
    if (
      !user ||
      !user.isActive ||
      !(await compare(dto.password, user.passwordHash))
    ) {
      await this.recordLoginFailure(user?.id ?? null, "invalid_credentials");
      throw new UnauthorizedException("Email or password is incorrect");
    }
    if (!user.emailVerified) {
      await this.recordLoginFailure(user.id, "email_not_verified");
      throw new UnauthorizedException(
        "Verify your email before signing in. You can request a new verification link.",
      );
    }
    if (user.phoneE164 && !user.phoneVerified) {
      await this.recordLoginFailure(user.id, "phone_not_verified");
      throw new UnauthorizedException(
        "Verify your mobile number before signing in. Request a new SMS code from the registration verification page.",
      );
    }
    if (
      user.role === UserRole.EMPLOYER &&
      ![
        EmployerApprovalStatus.PENDING,
        EmployerApprovalStatus.APPROVED,
      ].includes(user.employerApprovalStatus)
    ) {
      await this.recordLoginFailure(user.id, "employer_not_approved");
      throw new UnauthorizedException(
        user.employerApprovalStatus === EmployerApprovalStatus.REJECTED
          ? "This employer registration was not approved. Contact esllp support for assistance."
          : "This employer account is unavailable. Contact esllp support for assistance.",
      );
    }
    let mfaVerified = false;
    if (user.role === UserRole.SUPERADMIN) {
      if (await this.superadminMfa.isEnabled(user.id)) {
        if (!dto.mfaCode) return { mfaRequired: true };
        mfaVerified = await this.superadminMfa.verifyLogin(
          user.id,
          dto.mfaCode,
        );
        if (!mfaVerified) {
          await this.recordLoginFailure(user.id, "mfa_failed");
          throw new UnauthorizedException(
            "The authenticator or recovery code is incorrect.",
          );
        }
      } else {
        const setupToken = await this.jwtService.signAsync(
          { sub: user.id, scope: "superadmin_mfa_setup" },
          { expiresIn: "10m" },
        );
        return { mfaSetupRequired: true, setupToken };
      }
    }

    const session = await this.createSession(user, mfaVerified);
    await this.auditService.record({
      actorUserId: user.id,
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      details: {
        role: user.role,
        method: mfaVerified ? "password_mfa" : "password",
      },
    });
    return session;
  }

  async requestEmailOtp(emailInput: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOneBy({
      email: this.normalizeEmail(emailInput),
      isActive: true,
      role: UserRole.CANDIDATE,
      emailVerified: true,
    });
    if (user && (!user.phoneE164 || user.phoneVerified)) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await this.issueOtp(user, code, "email_otp", user.email);
      try {
        await this.emailDelivery.sendLoginCode(user.email, code);
      } catch (error) {
        this.logger.error(
          `Candidate sign-in code delivery failed: ${
            error instanceof Error ? error.message : "unknown delivery error"
          }`,
        );
        throw error;
      }
    }
    return {
      message:
        "If a verified candidate account exists for that email, a sign-in code will be sent.",
    };
  }

  async verifyEmailOtp(
    emailInput: string,
    code: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
    const email = this.normalizeEmail(emailInput);
    const user = await this.usersRepository.findOneBy({
      email,
      isActive: true,
      role: UserRole.CANDIDATE,
      emailVerified: true,
    });
    if (
      !user ||
      (user.phoneE164 && !user.phoneVerified) ||
      !(await this.consumeOtp(user.id, code, "email_otp", user.email))
    ) {
      await this.recordLoginFailure(user?.id ?? null, "invalid_email_otp");
      throw new UnauthorizedException("Email or code is incorrect or expired.");
    }
    const session = await this.createSession(user);
    await this.auditService.record({
      actorUserId: user.id,
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      details: { role: user.role, method: "email_otp" },
    });
    return session;
  }

  async googleSignIn(idToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    if (!clientId) {
      throw new ServiceUnavailableException(
        "Google sign-in is not configured for this deployment.",
      );
    }
    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      await this.recordLoginFailure(null, "invalid_google_token");
      throw new UnauthorizedException("Google sign-in could not be verified.", {
        cause: error,
      });
    }
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      await this.recordLoginFailure(null, "unverified_google_email");
      throw new UnauthorizedException(
        "Use a Google account with a verified email address.",
      );
    }

    const email = this.normalizeEmail(payload.email);
    let user = await this.usersRepository.findOneBy({
      googleSubject: payload.sub,
    });
    if (user) {
      if (
        !user.isActive ||
        user.email !== email ||
        user.role !== UserRole.CANDIDATE
      ) {
        throw new UnauthorizedException(
          "This Google account is not linked to an available candidate account.",
        );
      }
      if (user.phoneE164 && !user.phoneVerified) {
        throw new UnauthorizedException(
          "Verify your mobile number before signing in. Request a new SMS code from the registration verification page.",
        );
      }
    } else {
      user = await this.usersRepository.findOneBy({ email });
      if (user && !user.isActive) {
        throw new UnauthorizedException("This account is unavailable.");
      }
      if (user && user.role !== UserRole.CANDIDATE) {
        throw new UnauthorizedException(
          "Google sign-in is available for candidate accounts only.",
        );
      }
      if (user && user.googleSubject && user.googleSubject !== payload.sub) {
        throw new UnauthorizedException(
          "This candidate account is linked to a different Google account.",
        );
      }
      if (user?.phoneE164 && !user.phoneVerified) {
        throw new UnauthorizedException(
          "Verify your mobile number before signing in. Request a new SMS code from the registration verification page.",
        );
      }
      if (!user) {
        throw new BadRequestException(
          "To create a new account, register with your email and mobile number so both can be verified. You can link Google after signing in.",
        );
      } else {
        user.googleSubject = payload.sub;
        user.emailVerified = true;
      }
      try {
        user = await this.usersRepository.save(user);
      } catch (error) {
        if (
          !(error instanceof QueryFailedError) ||
          !this.isUniqueViolation(error)
        ) {
          throw error;
        }
        user = await this.usersRepository.findOneBy({
          googleSubject: payload.sub,
          email,
          role: UserRole.CANDIDATE,
        });
        if (!user?.isActive) throw error;
      }
    }

    const session = await this.createSession(user);
    await this.auditService.record({
      actorUserId: user.id,
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      details: { role: user.role, method: "google" },
    });
    return session;
  }

  async requestPasswordReset(emailInput: string): Promise<{ message: string }> {
    const email = this.normalizeEmail(emailInput);
    const user = await this.usersRepository.findOneBy({
      email,
      isActive: true,
    });
    if (user) {
      await this.auditService.record({
        actorUserId: user.id,
        action: "auth.password_reset_requested",
        targetType: "user",
        targetId: user.id,
      });
      try {
        await this.issueEmailToken(user, "password_reset");
      } catch (error) {
        this.logger.error(
          `Password reset email delivery failed: ${
            error instanceof Error ? error.message : "unknown delivery error"
          }`,
        );
      }
    }
    return {
      message:
        "If an active account exists for that email, a password reset link will be sent.",
    };
  }

  async resendVerification(emailInput: string): Promise<{ message: string }> {
    const email = this.normalizeEmail(emailInput);
    const user = await this.usersRepository.findOneBy({
      email,
      isActive: true,
    });
    if (user && !user.emailVerified) {
      await this.auditService.record({
        actorUserId: user.id,
        action: "auth.verification_resent",
        targetType: "user",
        targetId: user.id,
      });
      try {
        await this.sendVerification(user);
      } catch (error) {
        this.logger.error(
          `Verification email delivery failed: ${
            error instanceof Error ? error.message : "unknown delivery error"
          }`,
        );
      }
    }
    return {
      message:
        "If the account needs verification, a verification link will be sent.",
    };
  }

  async requestRegistrationPhoneVerification(
    emailInput: string,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findOneBy({
      email: this.normalizeEmail(emailInput),
      isActive: true,
    });
    if (user?.phoneE164 && !user.phoneVerified) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await this.issueOtp(user, code, "phone_verification", user.phoneE164);
      await this.smsDelivery.sendVerificationCode(user.phoneE164, code);
    }
    return {
      message:
        "If the account needs phone verification, a new code will be sent.",
    };
  }

  async verifyRegistrationPhone(
    emailInput: string,
    code: string,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findOneBy({
      email: this.normalizeEmail(emailInput),
      isActive: true,
    });
    const phoneNumber = user?.pendingPhoneE164 ?? user?.phoneE164;
    if (
      !user ||
      !phoneNumber ||
      !(await this.consumeOtp(user.id, code, "phone_verification", phoneNumber))
    ) {
      throw new UnauthorizedException(
        "Phone number or verification code is incorrect or expired.",
      );
    }
    await this.usersRepository.update(
      { id: user.id },
      {
        phoneE164: phoneNumber,
        pendingPhoneE164: null,
        phoneVerified: true,
      },
    );
    await this.auditService.record({
      actorUserId: user.id,
      action: "auth.phone_verified",
      targetType: "user",
      targetId: user.id,
    });
    return {
      message: user.emailVerified
        ? "Phone verified. Your email and phone are verified; you can now sign in."
        : "Phone verified. Verify your email before signing in.",
    };
  }

  async requestPhoneChange(
    userId: number,
    phoneInput: string,
  ): Promise<{ message: string }> {
    await this.smsDelivery.assertConfigured();
    const phoneNumber = this.normalizePhoneNumber(phoneInput);
    const existing = await this.usersRepository.findOneBy({
      phoneE164: phoneNumber,
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException(
        "That phone number is already associated with another account.",
      );
    }
    const user = await this.usersRepository.findOneBy({
      id: userId,
      isActive: true,
    });
    if (!user) throw new NotFoundException("Account was not found.");
    if (user.phoneE164 === phoneNumber && user.phoneVerified) {
      throw new BadRequestException("That mobile number is already verified.");
    }
    user.pendingPhoneE164 = phoneNumber;
    await this.usersRepository.save(user);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.issueOtp(user, code, "phone_verification", phoneNumber);
    await this.smsDelivery.sendVerificationCode(phoneNumber, code);
    return {
      message: "A verification code was sent to the new mobile number.",
    };
  }

  async verifyPhoneChange(
    userId: number,
    code: string,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findOneBy({
      id: userId,
      isActive: true,
    });
    const phoneNumber = user?.pendingPhoneE164;
    if (
      !user ||
      !phoneNumber ||
      !(await this.consumeOtp(user.id, code, "phone_verification", phoneNumber))
    ) {
      throw new UnauthorizedException(
        "Mobile number or verification code is incorrect or expired.",
      );
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).update(
        { id: user.id },
        {
          phoneE164: phoneNumber,
          pendingPhoneE164: null,
          phoneVerified: true,
        },
      );
      await manager.query(
        `UPDATE candidate_profiles
         SET whatsapp_interview_reminders = false,
             whatsapp_interview_reminders_consented_at = NULL
         WHERE user_id = $1`,
        [user.id],
      );
      await manager.query(
        `UPDATE whatsapp_notification_outbox
         SET status = 'cancelled', to_number = NULL,
             template_variables = NULL, updated_at = now()
         WHERE user_id = $1 AND status IN ('queued', 'sending')`,
        [user.id],
      );
      await this.auditService.record(
        {
          actorUserId: user.id,
          action: "candidate.whatsapp_interview_reminders_consent_changed",
          targetType: "user",
          targetId: user.id,
          details: { optedIn: false, reason: "verified_phone_changed" },
        },
        manager,
      );
    });
    await this.auditService.record({
      actorUserId: user.id,
      action: "auth.phone_number_changed",
      targetType: "user",
      targetId: user.id,
    });
    return { message: "Your mobile number has been verified and updated." };
  }

  async updateUsername(
    userId: number,
    usernameInput: string,
  ): Promise<{ username: string }> {
    const username = usernameInput.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(username)) {
      throw new BadRequestException(
        "Username must be 3–30 characters using letters, numbers, and hyphens; it must start with a letter or number.",
      );
    }
    const user = await this.usersRepository.findOneBy({
      id: userId,
      isActive: true,
    });
    if (!user) throw new NotFoundException("Account was not found.");
    const conflict = await this.usersRepository.findOneBy({ username });
    if (conflict && conflict.id !== user.id) {
      throw new ConflictException("That username is already taken.");
    }
    user.username = username;
    try {
      await this.usersRepository.save(user);
    } catch (error) {
      if (error instanceof QueryFailedError && this.isUniqueViolation(error)) {
        throw new ConflictException("That username is already taken.");
      }
      throw error;
    }
    await this.auditService.record({
      actorUserId: user.id,
      action: "account.username_changed",
      targetType: "user",
      targetId: user.id,
      details: { username },
    });
    return { username };
  }

  async verifyEmail(rawToken: string): Promise<{ message: string }> {
    const userId = await this.consumeEmailToken(rawToken, "email_verification");
    await this.usersRepository.update(
      { id: userId, emailVerified: false },
      { emailVerified: true },
    );
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(
        "The account for this verification link no longer exists.",
      );
    }
    await this.auditService.record({
      actorUserId: user.id,
      action: "auth.email_verified",
      targetType: "user",
      targetId: user.id,
    });
    if (
      user.role === UserRole.EMPLOYER &&
      user.employerApprovalStatus !== EmployerApprovalStatus.APPROVED
    ) {
      return {
        message:
          user.phoneE164 && !user.phoneVerified
            ? "Email address verified. Verify your mobile number before signing in; employer publishing also requires administrator approval."
            : "Email address verified. You can sign in to a read-only workspace while your employer account awaits administrator approval.",
      };
    }
    return {
      message:
        user.phoneE164 && !user.phoneVerified
          ? "Email address verified. Verify your mobile number before signing in."
          : "Email address verified. You can now sign in.",
    };
  }

  async resetPassword(
    rawToken: string,
    password: string,
  ): Promise<{ message: string }> {
    if (Buffer.byteLength(password, "utf8") > 72) {
      throw new BadRequestException(
        "Password must be no longer than 72 UTF-8 bytes.",
      );
    }
    const userId = await this.consumeEmailToken(rawToken, "password_reset");
    await this.usersRepository.update(
      { id: userId, isActive: true },
      { passwordHash: await hash(password, 12), mustChangePassword: false },
    );
    await this.sessionsRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    await this.auditService.record({
      actorUserId: userId,
      action: "auth.password_reset",
      targetType: "user",
      targetId: userId,
    });
    return {
      message: "Your password was reset. Sign in with your new password.",
    };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    if (Buffer.byteLength(newPassword, "utf8") > 72) {
      throw new BadRequestException(
        "Password must be no longer than 72 UTF-8 bytes.",
      );
    }
    const user = await this.usersRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.id = :userId AND user.isActive = true", { userId })
      .getOne();
    if (!user || !(await compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("Current password is incorrect.");
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        "Choose a new password different from your current password.",
      );
    }
    user.passwordHash = await hash(newPassword, 12);
    user.mustChangePassword = false;
    await this.usersRepository.save(user);
    await this.sessionsRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    await this.auditService.record({
      actorUserId: userId,
      action: "auth.password_changed",
      targetType: "user",
      targetId: userId,
    });
    return {
      message:
        "Password changed. Your other sessions have been signed out; sign in again.",
    };
  }

  async refresh(token: string | undefined): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
    if (!token) {
      throw new UnauthorizedException("A refresh session is required");
    }
    const tokenHash = this.hashToken(token);
    const session = await this.sessionsRepository.findOne({
      where: { tokenHash, revokedAt: IsNull() },
      relations: { user: true },
    });
    if (
      !session ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.isActive ||
      (session.user.role === UserRole.SUPERADMIN && !session.mfaVerified) ||
      (session.user.role === UserRole.EMPLOYER &&
        ![
          EmployerApprovalStatus.PENDING,
          EmployerApprovalStatus.APPROVED,
        ].includes(session.user.employerApprovalStatus))
    ) {
      throw new UnauthorizedException(
        "The refresh session is invalid or expired",
      );
    }

    const rotation = await this.sessionsRepository.update(
      { tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (rotation.affected !== 1) {
      throw new UnauthorizedException(
        "The refresh session has already been used",
      );
    }
    return this.createSession(session.user, session.mfaVerified);
  }

  async startSuperadminMfaSetup(setupToken: string) {
    const user = await this.superadminMfaSetupUser(setupToken);
    return this.superadminMfa.startEnrollment(user.id, user.email);
  }

  async confirmSuperadminMfaSetup(setupToken: string, code: string) {
    const user = await this.superadminMfaSetupUser(setupToken);
    const recoveryCodes = await this.superadminMfa.confirmEnrollment(
      user.id,
      code,
    );
    await this.sessionsRepository.update(
      { userId: user.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    const session = await this.createSession(user, true);
    await this.auditService.record({
      actorUserId: user.id,
      action: "auth.superadmin_mfa_enabled",
      targetType: "user",
      targetId: user.id,
    });
    await this.auditService.record({
      actorUserId: user.id,
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      details: { role: user.role, method: "mfa_setup" },
    });
    return { ...session, recoveryCodes };
  }

  private async superadminMfaSetupUser(setupToken: string) {
    let payload: { sub: number; scope?: string };
    try {
      payload = await this.jwtService.verifyAsync(setupToken);
    } catch {
      throw new UnauthorizedException(
        "The MFA setup session is invalid or expired. Sign in again.",
      );
    }
    if (
      payload.scope !== "superadmin_mfa_setup" ||
      !Number.isSafeInteger(payload.sub)
    )
      throw new UnauthorizedException("A valid MFA setup session is required.");
    const user = await this.usersRepository.findOneBy({
      id: payload.sub,
      role: UserRole.SUPERADMIN,
      isActive: true,
    });
    if (!user)
      throw new UnauthorizedException(
        "This superadmin account is unavailable.",
      );
    return user;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    const tokenHash = this.hashToken(token);
    const session = await this.sessionsRepository.findOneBy({
      tokenHash,
      revokedAt: IsNull(),
    });
    const result = await this.sessionsRepository.update(
      { tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (result.affected && session) {
      await this.auditService.record({
        actorUserId: session.userId,
        action: "auth.logout",
        targetType: "user",
        targetId: session.userId,
      });
    }
  }

  async getSafeUser(id: number): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findOneBy({ id, isActive: true });
    if (!user) {
      throw new UnauthorizedException("This account is unavailable");
    }
    return this.toSafeUser(user);
  }

  private async createSession(
    user: User,
    mfaVerified = false,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
    const refreshToken = randomBytes(48).toString("base64url");
    await this.sessionsRepository.save(
      this.sessionsRepository.create({
        tokenHash: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revokedAt: null,
        mfaVerified: user.role === UserRole.SUPERADMIN && mfaVerified,
      }),
    );
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        mfa: user.role === UserRole.SUPERADMIN && mfaVerified,
      },
      {
        expiresIn: ACCESS_TOKEN_TTL,
      },
    );
    return { accessToken, refreshToken, user: this.toSafeUser(user) };
  }

  private toSafeUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      employerApprovalStatus: user.employerApprovalStatus,
      mustChangePassword: user.mustChangePassword,
      username: user.username ?? `user-${user.id}`,
      phoneVerified: user.phoneVerified,
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    const normalized = phoneNumber.trim().replace(/[\s().-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadRequestException(
        "Enter a valid international mobile number including its country code, such as +919876543210.",
      );
    }
    return normalized;
  }

  private recordLoginFailure(
    actorUserId: number | null,
    reason: string,
  ): Promise<unknown> {
    return this.auditService.record({
      actorUserId,
      action: "auth.login_failed",
      targetType: actorUserId === null ? "authentication" : "user",
      targetId: actorUserId ?? "unknown",
      details: { reason },
    });
  }

  private slugify(value: string): string {
    return (
      value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 150) || "company"
    );
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async sendVerification(user: User): Promise<void> {
    const token = await this.issueEmailToken(user, "email_verification");
    await this.emailDelivery.sendAccountLink(
      user.email,
      "verify your email",
      this.buildAccountLink("verify-email", token, user.email),
    );
  }

  private async issueEmailToken(
    user: User,
    purpose: AuthTokenPurpose,
  ): Promise<string> {
    await this.tokensRepository.update(
      { userId: user.id, purpose, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    const token = randomBytes(32).toString("base64url");
    const lifetime =
      purpose === "email_verification" ? 24 * 60 * 60_000 : 30 * 60_000;
    await this.tokensRepository.save(
      this.tokensRepository.create({
        tokenHash: this.hashToken(token),
        userId: user.id,
        purpose,
        expiresAt: new Date(Date.now() + lifetime),
        usedAt: null,
      }),
    );
    if (purpose === "password_reset") {
      await this.emailDelivery.sendAccountLink(
        user.email,
        "reset your password",
        this.buildAccountLink("reset-password", token),
      );
    }
    return token;
  }

  private async issueOtp(
    user: User,
    code: string,
    purpose: "email_otp" | "phone_verification",
    destination: string,
  ): Promise<void> {
    await this.tokensRepository.update(
      { userId: user.id, purpose, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    await this.tokensRepository.save(
      this.tokensRepository.create({
        tokenHash: this.hashToken(
          `${purpose}:${user.id}:${destination}:${code}`,
        ),
        userId: user.id,
        purpose,
        expiresAt: new Date(Date.now() + 10 * 60_000),
        usedAt: null,
      }),
    );
  }

  private async consumeOtp(
    userId: number,
    code: string,
    purpose: "email_otp" | "phone_verification",
    destination: string,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(AuthToken);
      const token = await tokens
        .createQueryBuilder("token")
        .where("token.userId = :userId", { userId })
        .andWhere("token.purpose = :purpose", { purpose })
        .andWhere("token.usedAt IS NULL")
        .andWhere("token.expiresAt > :now", { now: new Date() })
        .orderBy("token.createdAt", "DESC")
        .setLock("pessimistic_write")
        .getOne();
      if (!token || token.attempts >= 5) return false;
      const expected = Buffer.from(
        this.hashToken(`${purpose}:${userId}:${destination}:${code}`),
        "hex",
      );
      const supplied = Buffer.from(token.tokenHash, "hex");
      if (
        expected.length === supplied.length &&
        timingSafeEqual(expected, supplied)
      ) {
        token.usedAt = new Date();
        await tokens.save(token);
        return true;
      }
      token.attempts += 1;
      if (token.attempts >= 5) token.usedAt = new Date();
      await tokens.save(token);
      return false;
    });
  }

  private isUniqueViolation(error: QueryFailedError): boolean {
    const driverError = error.driverError;
    return (
      typeof driverError === "object" &&
      driverError !== null &&
      "code" in driverError &&
      driverError.code === "23505"
    );
  }

  private async consumeEmailToken(
    rawToken: string,
    purpose: AuthTokenPurpose,
  ): Promise<number> {
    if (!rawToken || rawToken.length > 128) {
      throw new BadRequestException("This link is invalid or has expired.");
    }
    const result: Array<{ user_id: number }> = await this.tokensRepository
      .createQueryBuilder()
      .update(AuthToken)
      .set({ usedAt: new Date() })
      .where("token_hash = :tokenHash", {
        tokenHash: this.hashToken(rawToken),
      })
      .andWhere("purpose = :purpose", { purpose })
      .andWhere("used_at IS NULL")
      .andWhere("expires_at > :now", { now: new Date() })
      .returning(["user_id"])
      .execute()
      .then((queryResult) => queryResult.raw as Array<{ user_id: number }>);
    if (result.length !== 1) {
      throw new BadRequestException("This link is invalid or has expired.");
    }
    const user = await this.usersRepository.findOneBy({
      id: result[0].user_id,
      isActive: true,
    });
    if (!user) {
      throw new NotFoundException("This account is unavailable.");
    }
    return user.id;
  }

  private buildAccountLink(
    action: string,
    token: string,
    email?: string,
  ): string {
    const configuredUrl = process.env.PUBLIC_APP_URL?.trim();
    if (!configuredUrl) {
      throw new ServiceUnavailableException(
        "PUBLIC_APP_URL must be configured to send account links.",
      );
    }
    let baseUrl: URL;
    try {
      baseUrl = new URL(configuredUrl);
    } catch (error) {
      throw new ServiceUnavailableException(
        "PUBLIC_APP_URL must be a valid HTTPS URL.",
        { cause: error },
      );
    }
    if (
      baseUrl.protocol !== "https:" &&
      !(baseUrl.protocol === "http:" && baseUrl.hostname === "localhost")
    ) {
      throw new ServiceUnavailableException(
        "PUBLIC_APP_URL must use HTTPS in production.",
      );
    }
    const parameters = new URLSearchParams({ token });
    if (email) parameters.set("email", email);
    baseUrl.hash = `#${action}?${parameters.toString()}`;
    return baseUrl.toString();
  }
}
