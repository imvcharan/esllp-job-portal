import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateJobDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  company!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  location!: string;

  @IsOptional()
  @IsString()
  @IsIn(["onsite", "hybrid", "remote"])
  workplaceType?: string;

  @IsOptional()
  @IsString()
  @IsIn(["full-time", "part-time", "contract", "internship", "temporary"])
  employmentType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  salaryMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  salaryMax?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  experience?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  employerUserId?: number | null;
}
