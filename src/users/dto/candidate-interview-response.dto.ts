import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CandidateInterviewResponseDto {
  @IsIn(["accepted", "declined", "reschedule_requested"])
  response!: "accepted" | "declined" | "reschedule_requested";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
