import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { JOB_SALARY_CURRENCIES, JOB_SALARY_PERIODS } from "../../jobs/job.constants";

const experienceLevels = ["early", "mid", "senior"];
const sortOptions = ["newest", "salary", "title"];

export class CreateCandidateSavedSearchDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  workplaceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  employmentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  skill?: string;

  @IsOptional()
  @IsIn(experienceLevels)
  experience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  company?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  minimumSalary?: number;

  @IsOptional()
  @IsIn(JOB_SALARY_CURRENCIES)
  salaryCurrency?: string;

  @IsOptional()
  @IsIn(JOB_SALARY_PERIODS)
  salaryPeriod?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  freshnessDays?: number;

  @IsOptional()
  @IsIn(sortOptions)
  sort?: string;

  @IsOptional()
  @IsBoolean()
  emailAlerts?: boolean;
}
