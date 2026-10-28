import { IsISO8601, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCandidateApplicationOfferDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  termsSummary!: string;

  @IsISO8601()
  expiresAt!: string;
}
