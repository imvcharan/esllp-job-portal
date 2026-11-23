import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreatePaymentCouponDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsIn(["percentage", "fixed"])
  discountType!: "percentage" | "fixed";

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  discountValuePaise!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxRedemptions?: number;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;
}

export class CreatePaymentRefundDto {
  @IsIn(["candidate", "employer"])
  paymentSource!: "candidate" | "employer";

  @IsString()
  @MaxLength(100)
  paymentReference!: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountPaise!: number;

  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class ReviewPaymentRefundDto {
  @IsIn(["approved", "rejected"])
  status!: "approved" | "rejected";

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
