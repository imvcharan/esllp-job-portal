import { Transform, Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  Matches,
  IsOptional,
  IsObject,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
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
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,19}$/)
  status?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(all|unassigned|[1-9]\d*)$/)
  assignee?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsIn(["newest", "oldest", "name"])
  sort?: "newest" | "oldest" | "name";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  jobId?: number;
}

export class EmployerHiringReportQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

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
  @Matches(/\S/)
  note!: string;
}

export class AssignApplicationDto {
  @Transform(({ value }) => (value === null ? null : Number(value)))
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  assigneeUserId!: number | null;
}

export class EmployerTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(/\S/)
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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  interviewerUserId?: number;

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

export class UpdateEmployerInterviewDto {
  @IsISO8601()
  startsAt!: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  interviewerUserId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  meetingUrl?: string;
}

export class EmployerInterviewFeedbackDto {
  @IsObject()
  scores!: Record<string, number>;

  @IsIn(["strong_yes", "yes", "maybe", "no"])
  recommendation!: "strong_yes" | "yes" | "maybe" | "no";

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class CreateEmployerOfferDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  termsSummary!: string;

  @IsISO8601()
  expiresAt!: string;
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
  @IsIn(["starter", "growth", "business", "enterprise"])
  planKey!: "starter" | "growth" | "business" | "enterprise";
}
