import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ValidateIf,
} from "class-validator";

export class VerifyCandidatePremiumPaymentDto {
  @IsString()
  @MaxLength(100)
  orderId!: string;

  @IsString()
  @MaxLength(100)
  paymentId!: string;

  @IsString()
  @MaxLength(128)
  signature!: string;
}

export class CreateCandidatePremiumCheckoutDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  productKey!: string;
}

export class CreateCandidatePremiumProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1000000)
  amountInr!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(3650)
  fulfillmentDays?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateCandidatePremiumProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1000000)
  amountInr!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(3650)
  fulfillmentDays?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  enabled?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description?: string;
}

export class DeleteCandidatePremiumProductDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class UpdateCandidatePremiumFulfillmentDto {
  @IsIn(["pending", "in_progress", "completed", "cancelled"])
  status!: "pending" | "in_progress" | "completed" | "cancelled";

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  note?: string;
}
