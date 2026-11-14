import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { CaptchaDto } from "./captcha.dto";

export class LoginDto extends CaptchaDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  mfaCode?: string;
}
