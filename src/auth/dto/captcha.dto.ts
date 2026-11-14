import { IsOptional, IsString, MaxLength } from "class-validator";

export class CaptchaDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}
