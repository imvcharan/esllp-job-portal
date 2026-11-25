import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateEmployerBillingProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  address?: string | null;
}
