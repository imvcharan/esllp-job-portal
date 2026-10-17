import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class AccountEmailDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class AccountTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token!: string;
}

export class ResetPasswordDto extends AccountTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
