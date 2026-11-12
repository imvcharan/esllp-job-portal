import { PartialType } from "@nestjs/mapped-types";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  JOB_SALARY_CURRENCIES,
  JOB_SALARY_PERIODS,
} from "../../jobs/job.constants";

export class JobApplicationQuestionDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  id!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  question!: string;

  @IsBoolean()
  required!: boolean;
}

export class JobRequiredDocumentDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  id!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label!: string;

  @IsBoolean()
  required!: boolean;
}

export class CreateEmployerJobDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

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
  @IsIn(JOB_SALARY_CURRENCIES)
  salaryCurrency?: string;

  @IsOptional()
  @IsString()
  @IsIn(JOB_SALARY_PERIODS)
  salaryPeriod?: string;

  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  applicationDeadline?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  numberOfOpenings?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  experience?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => JobApplicationQuestionDto)
  applicationQuestions?: JobApplicationQuestionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => JobRequiredDocumentDto)
  requiredDocuments?: JobRequiredDocumentDto[];
}

export class UpdateEmployerJobDto extends PartialType(CreateEmployerJobDto) {}
