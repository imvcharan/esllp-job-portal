import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthenticatedUser } from "./auth.types";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto, RegisterEmployerDto } from "./dto/register.dto";
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
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.registerCandidate(dto);
  }

  @Post("register/employer")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  registerEmployer(@Body() dto: RegisterEmployerDto) {
    return this.authService.registerEmployer(dto);
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestPasswordReset(@Body() dto: AccountEmailDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Body() dto: AccountTokenDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendVerification(@Body() dto: AccountEmailDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
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
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.login(dto);
    response.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...refreshCookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
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
