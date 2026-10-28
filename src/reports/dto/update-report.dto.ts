import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ReportStatus } from "../report.entity";

export class UpdateReportDto {
  @IsIn([ReportStatus.REVIEWING, ReportStatus.ACTIONED, ReportStatus.DISMISSED])
  status!: ReportStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}
