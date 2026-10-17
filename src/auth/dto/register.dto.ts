import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;
}

export class RegisterEmployerDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @ValidateIf((dto: RegisterEmployerDto) => !dto.invitationToken)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  companyName?: string;

  @ValidateIf(
    (dto: RegisterEmployerDto) =>
      !dto.invitationToken && dto.companyWebsite !== undefined,
  )
  @IsString()
  @MaxLength(500)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  companyWebsite?: string;

  @IsOptional()
  @IsString()
  @MinLength(30)
  @MaxLength(100)
  invitationToken?: string;
}

export class BootstrapSuperadminDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
