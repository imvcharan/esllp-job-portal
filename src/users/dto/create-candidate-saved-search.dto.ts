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

const employmentTypes = [
  "full-time",
  "part-time",
  "contract",
  "internship",
  "temporary",
];
const workplaceTypes = ["onsite", "hybrid", "remote"];
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
  @IsIn(workplaceTypes)
  workplaceType?: string;

  @IsOptional()
  @IsIn(employmentTypes)
  employmentType?: string;

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
