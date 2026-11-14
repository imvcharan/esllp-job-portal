import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthenticatedUser } from "./auth.types";
import { AuthService } from "./auth.service";
import { CaptchaVerificationService } from "./captcha-verification.service";
import {
  ConfirmSuperadminMfaDto,
  SuperadminMfaSetupDto,
} from "./dto/superadmin-mfa.dto";
import {
  GoogleSignInDto,
  RequestEmailOtpDto,
  VerifyEmailOtpDto,
} from "./dto/email-otp.dto";
import {
  RequestPhoneChangeDto,
  ResendRegistrationPhoneDto,
  UpdateUsernameDto,
  VerifyPhoneChangeDto,
  VerifyRegistrationPhoneDto,
} from "./dto/phone-verification.dto";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { AllowForcedPasswordChange } from "./forced-password-change.decorator";
import { LoginDto } from "./dto/login.dto";
import {
  BootstrapSuperadminDto,
  RegisterDto,
  RegisterEmployerDto,
} from "./dto/register.dto";
import {
  AccountEmailDto,
  ChangePasswordDto,
  ResetPasswordDto,
  AccountTokenDto,
} from "./dto/account-link.dto";

const REFRESH_COOKIE = "esllp_refresh";
const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
};

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly captcha: CaptchaVerificationService,
  ) {}

  @Get("config")
  @Header("Cache-Control", "no-store")
  async config() {
    return {
      ...(await this.authService.publicConfiguration()),
      ...this.captcha.publicConfiguration(),
    };
  }

  @Post("email-otp/request")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async requestEmailOtp(
    @Body() dto: RequestEmailOtpDto,
    @Req() request: Request,
  ) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    return this.authService.requestEmailOtp(dto.email);
  }

  @Post("phone-verification/request")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async requestRegistrationPhoneVerification(
    @Body() dto: ResendRegistrationPhoneDto,
    @Req() request: Request,
  ) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    return this.authService.requestRegistrationPhoneVerification(dto.email);
  }

  @Post("phone-verification/verify")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async verifyRegistrationPhone(
    @Body() dto: VerifyRegistrationPhoneDto,
    @Req() request: Request,
  ) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    return this.authService.verifyRegistrationPhone(dto.email, dto.code);
  }

  @Put("me/username")
  @UseGuards(JwtAuthGuard)
  @Header("Cache-Control", "private, no-store")
  updateUsername(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUsernameDto,
  ) {
    return this.authService.updateUsername(user.id, dto.username);
  }

  @Post("phone/change/request")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestPhoneChange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestPhoneChangeDto,
  ) {
    return this.authService.requestPhoneChange(user.id, dto.phoneNumber);
  }

  @Post("phone/change/verify")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  verifyPhoneChange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyPhoneChangeDto,
  ) {
    return this.authService.verifyPhoneChange(user.id, dto.code);
  }

  @Post("email-otp/verify")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async verifyEmailOtp(
    @Body() dto: VerifyEmailOtpDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    const session = await this.authService.verifyEmailOtp(dto.email, dto.code);
    response.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...refreshCookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post("google")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleSignIn(
    @Body() dto: GoogleSignInDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    const session = await this.authService.googleSignIn(dto.idToken);
    response.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...refreshCookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto, @Req() request: Request) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    return this.authService.registerCandidate(dto);
  }

  @Post("register/employer")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async registerEmployer(
    @Body() dto: RegisterEmployerDto,
    @Req() request: Request,
  ) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    return this.authService.registerEmployer(dto);
  }

  @Get("bootstrap-superadmin/status")
  @Header("Cache-Control", "no-store")
  bootstrapSuperadminStatus() {
    return this.authService.bootstrapSuperadminStatus();
  }

  @Post("bootstrap-superadmin")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async bootstrapSuperadmin(
    @Body() dto: BootstrapSuperadminDto,
    @Req() request: Request,
  ) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    return this.authService.bootstrapSuperadmin(dto);
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async requestPasswordReset(
    @Body() dto: AccountEmailDto,
    @Req() request: Request,
  ) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(@Body() dto: AccountTokenDto, @Req() request: Request) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    return this.authService.verifyEmail(dto.token);
  }

  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resendVerification(
    @Body() dto: AccountEmailDto,
    @Req() request: Request,
  ) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    return this.authService.resendVerification(dto.email);
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @AllowForcedPasswordChange()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    response.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
    return result;
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.captcha.verify(dto.captchaToken, request.ip);
    const session = await this.authService.login(dto);
    if ("mfaRequired" in session || "mfaSetupRequired" in session) {
      response.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
      return session;
    }
    response.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...refreshCookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post("mfa/setup/start")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  startSuperadminMfaSetup(@Body() dto: SuperadminMfaSetupDto) {
    return this.authService.startSuperadminMfaSetup(dto.setupToken);
  }

  @Post("mfa/setup/confirm")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async confirmSuperadminMfaSetup(
    @Body() dto: ConfirmSuperadminMfaDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.confirmSuperadminMfaSetup(
      dto.setupToken,
      dto.code,
    );
    response.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...refreshCookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return {
      accessToken: result.accessToken,
      user: result.user,
      recoveryCodes: result.recoveryCodes,
    };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.refresh(
      request.cookies?.[REFRESH_COOKIE] as string | undefined,
    );
    response.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...refreshCookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(
      request.cookies?.[REFRESH_COOKIE] as string | undefined,
    );
    response.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
    return { success: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
