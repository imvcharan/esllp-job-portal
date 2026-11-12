import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
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
  @IsIn(["resume-review", "profile-boost", "career-consultation"])
  productKey!: string;
}

export class UpdateCandidatePremiumProductDto {
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
  @MaxLength(500)
  description?: string;
}

export class UpdateCandidatePremiumFulfillmentDto {
  @IsIn(["pending", "in_progress", "completed", "cancelled"])
  status!: "pending" | "in_progress" | "completed" | "cancelled";

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  note?: string;
}
