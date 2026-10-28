import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { ReportTargetType } from "../report.entity";

export class CreateReportDto {
  @IsIn(Object.values(ReportTargetType))
  targetType!: ReportTargetType;

  @IsInt()
  @Min(1)
  targetId!: number;

  @IsIn(["misleading", "spam", "discriminatory", "inaccurate", "other"])
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}
