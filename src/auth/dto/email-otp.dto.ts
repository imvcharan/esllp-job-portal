import { IsEmail, IsString, Matches, MaxLength } from "class-validator";
import { CaptchaDto } from "./captcha.dto";

export class RequestEmailOtpDto extends CaptchaDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class VerifyEmailOtpDto extends RequestEmailOtpDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class GoogleSignInDto extends CaptchaDto {
  @IsString()
  @MaxLength(8192)
  idToken!: string;
}
