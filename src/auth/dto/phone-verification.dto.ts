import { IsEmail, IsString, Matches, MaxLength } from "class-validator";
import { CaptchaDto } from "./captcha.dto";

export class VerifyRegistrationPhoneDto extends CaptchaDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class ResendRegistrationPhoneDto extends CaptchaDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class RequestPhoneChangeDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneNumber!: string;
}

export class VerifyPhoneChangeDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class UpdateUsernameDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]{2,29}$/)
  username!: string;
}
