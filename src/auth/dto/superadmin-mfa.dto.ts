import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class SuperadminMfaSetupDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  setupToken!: string;
}

export class ConfirmSuperadminMfaDto extends SuperadminMfaSetupDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
