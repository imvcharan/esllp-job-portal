import { Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class EmployerApplicantsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn([
    "all",
    "submitted",
    "in_review",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
  ])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  jobId?: number;
}

export class CreateEmployerNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  note!: string;
}

export class EmployerTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label!: string;
}

export class CreateEmployerInterviewDto {
  @IsISO8601()
  startsAt!: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  meetingUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class InviteTeamMemberDto {
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(["admin", "recruiter", "hiring_manager", "billing"])
  role!: "admin" | "recruiter" | "hiring_manager" | "billing";
}

export class UpdateTeamMemberDto {
  @IsIn(["admin", "recruiter", "hiring_manager", "billing", "removed"])
  role!: "admin" | "recruiter" | "hiring_manager" | "billing" | "removed";
}

export class AcceptTeamInviteDto {
  @IsString()
  @MinLength(30)
  @MaxLength(100)
  token!: string;
}

export class VerifyRazorpaySubscriptionDto {
  @IsString()
  @MaxLength(100)
  razorpay_payment_id!: string;

  @IsString()
  @MaxLength(100)
  razorpay_subscription_id!: string;

  @IsString()
  @MaxLength(128)
  razorpay_signature!: string;
}

export class CreateEmployerSubscriptionDto {
  @IsIn(["starter", "growth"])
  planKey!: "starter" | "growth";
}
