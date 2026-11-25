import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class ReviewCompanyVerificationDto {
  @IsIn(["verified", "rejected"])
  status!: "verified" | "rejected";

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
