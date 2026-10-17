import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class SubmitCandidateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coverLetter?: string;

  @IsOptional()
  @IsBoolean()
  includeResume?: boolean;

  @IsOptional()
  @IsBoolean()
  shareProfile?: boolean;
}
