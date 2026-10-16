import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitCandidateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coverLetter?: string;
}
