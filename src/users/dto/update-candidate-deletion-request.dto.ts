import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { CandidateDeletionRequestStatus } from "../candidate-deletion-request.entity";

export class UpdateCandidateDeletionRequestDto {
  @IsIn([
    CandidateDeletionRequestStatus.REVIEWING,
    CandidateDeletionRequestStatus.DEFERRED,
  ])
  status!: CandidateDeletionRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
