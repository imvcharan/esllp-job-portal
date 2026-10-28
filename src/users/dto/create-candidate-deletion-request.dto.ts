import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateCandidateDeletionRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}
