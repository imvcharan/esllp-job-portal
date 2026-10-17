import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DataSource, IsNull, Repository } from "typeorm";
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

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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
  ) {}

  async registerCandidate(
    dto: RegisterDto,
  ): Promise<{ id: number; email: string }> {
    const email = this.normalizeEmail(dto.email);
    if (Buffer.byteLength(dto.password, "utf8") > 72) {
      throw new BadRequestException(
        "Password must be no longer than 72 UTF-8 bytes",
      );
    }
    if (await this.usersRepository.findOneBy({ email })) {
      throw new ConflictException("An account with this email already exists");
    }

    const user = this.usersRepository.create({
      email,
      passwordHash: await hash(dto.password, 12),
      displayName: dto.displayName.trim(),
      role: UserRole.CANDIDATE,
    });
    const saved = await this.usersRepository.save(user);
    await this.sendVerification(saved);
    return { id: saved.id, email: saved.email };
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

    await this.dataSource.transaction(async (manager) => {
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
      await users.save(
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

    return { email };
  }

  async registerEmployer(
    dto: RegisterEmployerDto,
  ): Promise<{ id: number; email: string; message: string }> {
    const email = this.normalizeEmail(dto.email);
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

    const user = this.usersRepository.create({
      email,
      passwordHash: await hash(dto.password, 12),
      displayName: dto.displayName.trim(),
      companyName: companyName || null,
      companyWebsite: dto.companyWebsite?.trim() || null,
      role: UserRole.EMPLOYER,
      employerApprovalStatus: EmployerApprovalStatus.PENDING,
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
    try {
      await this.sendVerification(saved);
    } catch (error) {
      this.logger.error(
        `Employer registration verification email failed for user ${saved.id}: ${
          error instanceof Error ? error.message : "unknown delivery error"
        }`,
      );
    }
    return {
      id: saved.id,
      email: saved.email,
      message: registration.invited
        ? "Company invitation recorded. Verify your email to preview the read-only workspace while your employer account awaits administrator approval."
        : "Employer registration received. Verify your email to preview the read-only workspace while your account awaits administrator approval.",
    };
  }

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
    if (Buffer.byteLength(dto.password, "utf8") > 72) {
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
      throw new UnauthorizedException("Email or password is incorrect");
    }
    if (!user.emailVerified) {
      throw new UnauthorizedException(
        "Verify your email before signing in. You can request a new verification link.",
      );
    }
    if (
      user.role === UserRole.EMPLOYER &&
      ![
        EmployerApprovalStatus.PENDING,
        EmployerApprovalStatus.APPROVED,
      ].includes(user.employerApprovalStatus)
    ) {
      throw new UnauthorizedException(
        user.employerApprovalStatus === EmployerApprovalStatus.REJECTED
          ? "This employer registration was not approved. Contact esllp support for assistance."
          : "This employer account is unavailable. Contact esllp support for assistance.",
      );
    }
    return this.createSession(user);
  }

  async requestPasswordReset(emailInput: string): Promise<{ message: string }> {
    const email = this.normalizeEmail(emailInput);
    const user = await this.usersRepository.findOneBy({
      email,
      isActive: true,
    });
    if (user) {
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
    if (
      user.role === UserRole.EMPLOYER &&
      user.employerApprovalStatus !== EmployerApprovalStatus.APPROVED
    ) {
      return {
        message:
          "Email address verified. You can sign in to a read-only workspace while your employer account awaits administrator approval.",
      };
    }
    return { message: "Email address verified. You can now sign in." };
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
      { passwordHash: await hash(password, 12) },
    );
    await this.sessionsRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
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
    await this.usersRepository.save(user);
    await this.sessionsRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
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
    return this.createSession(session.user);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    await this.sessionsRepository.update(
      { tokenHash: this.hashToken(token), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async getSafeUser(id: number): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findOneBy({ id, isActive: true });
    if (!user) {
      throw new UnauthorizedException("This account is unavailable");
    }
    return this.toSafeUser(user);
  }

  private async createSession(user: User): Promise<{
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
      }),
    );
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id },
      { expiresIn: ACCESS_TOKEN_TTL },
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
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
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
      "Verify your esllp email",
      "verify your email",
      this.buildAccountLink("verify-email", token),
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
        "Reset your esllp password",
        "reset your password",
        this.buildAccountLink("reset-password", token),
      );
    }
    return token;
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

  private buildAccountLink(action: string, token: string): string {
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
    baseUrl.hash = `#${action}?token=${encodeURIComponent(token)}`;
    return baseUrl.toString();
  }
}
