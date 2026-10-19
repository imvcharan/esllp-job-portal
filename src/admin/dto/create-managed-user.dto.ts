import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { UserRole } from "../../users/user.entity";

export type ManagedUserRole =
  | UserRole.EMPLOYER
  | UserRole.STAFF
  | UserRole.ADMIN;

export class CreateManagedUserDto {
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
  temporaryPassword!: string;

  @IsIn([UserRole.EMPLOYER, UserRole.STAFF, UserRole.ADMIN])
  role!: ManagedUserRole;

  @ValidateIf((dto: CreateManagedUserDto) => dto.role === UserRole.EMPLOYER)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  companyName?: string;

  @IsOptional()
  @ValidateIf(
    (dto: CreateManagedUserDto) =>
      dto.role === UserRole.EMPLOYER && dto.companyWebsite !== undefined,
  )
  @IsString()
  @MaxLength(500)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  companyWebsite?: string;
}
