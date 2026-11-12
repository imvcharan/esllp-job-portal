import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class UpdateRazorpayConfigurationDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  enabled?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(255)
  keyId?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(255)
  apiSecret?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(255)
  webhookSecret?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  starterPlanId?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  starterAmountInr?: number | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  growthPlanId?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  growthAmountInr?: number | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  businessPlanId?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  businessAmountInr?: number | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  enterprisePlanId?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  enterpriseAmountInr?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  starterActiveJobs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  starterSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  starterResumeCredits?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  growthActiveJobs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  growthSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  growthResumeCredits?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  businessActiveJobs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  businessSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  businessResumeCredits?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  enterpriseActiveJobs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  enterpriseSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  enterpriseResumeCredits?: number;
}
