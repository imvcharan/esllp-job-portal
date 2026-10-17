import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Matches,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class CandidateExperienceDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  company!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsString()
  @MaxLength(7)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  startDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^(?:\d{4}-(0[1-9]|1[0-2]))?$/)
  endDate?: string;

  @IsBoolean()
  current!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class CandidateEducationDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  institution!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  qualification!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fieldOfStudy?: string;

  @IsString()
  @MaxLength(7)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  startDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^(?:\d{4}-(0[1-9]|1[0-2]))?$/)
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class CandidateLinksDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf((_object, value) => value !== "")
  @IsString()
  @MaxLength(500)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  linkedin?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf((_object, value) => value !== "")
  @IsString()
  @MaxLength(500)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  portfolio?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf((_object, value) => value !== "")
  @IsString()
  @MaxLength(500)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  github?: string;
}

export class UpdateCandidateProfileDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  desiredJobTitles?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(["full-time", "part-time", "contract", "internship", "temporary"], {
    each: true,
  })
  employmentTypes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(["onsite", "hybrid", "remote"], { each: true })
  workplaceTypes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CandidateExperienceDto)
  experience?: CandidateExperienceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CandidateEducationDto)
  education?: CandidateEducationDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateLinksDto)
  links?: CandidateLinksDto;

  @IsOptional()
  @IsBoolean()
  shareProfileOnApplication?: boolean;

  @IsOptional()
  @IsBoolean()
  applicationEmailUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  jobAlertEmails?: boolean;
}
