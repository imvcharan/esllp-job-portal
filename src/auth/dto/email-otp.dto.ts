import { IsEmail, IsString, Matches, MaxLength } from "class-validator";

export class RequestEmailOtpDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class VerifyEmailOtpDto extends RequestEmailOtpDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class GoogleSignInDto {
  @IsString()
  @MaxLength(8192)
  idToken!: string;
}
