import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { CONFIGURABLE_REPORT_KEYS } from "../../platform-config/report-definitions";

export class ApplicationWorkflowStageDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,19}$/)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Matches(/^[a-z][a-z0-9_]{0,19}$/, { each: true })
  transitions!: string[];
}

export class ConfigurableReportDefinitionDto {
  @IsString()
  @IsIn([...CONFIGURABLE_REPORT_KEYS])
  key!: (typeof CONFIGURABLE_REPORT_KEYS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdatePlatformConfigurationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsBoolean()
  candidateRegistrationEnabled!: boolean;

  @IsBoolean()
  employerRegistrationEnabled!: boolean;

  @IsBoolean()
  employerApprovalRequired!: boolean;

  @IsBoolean()
  jobApprovalRequired!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  jobCategories?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  industries?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  locations?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  employmentTypes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  workplaceTypes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ApplicationWorkflowStageDto)
  applicationStages?: ApplicationWorkflowStageDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ConfigurableReportDefinitionDto)
  reportDefinitions?: ConfigurableReportDefinitionDto[];
}

export class ResetPlatformConfigurationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
