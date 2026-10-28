import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ResolveCandidateWithdrawalDto {
  @IsIn(["approve", "decline"])
  decision!: "approve" | "decline";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
