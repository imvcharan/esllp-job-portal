import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class ModerateJobDto {
  @IsIn(["approved", "rejected", "paused"])
  status!: "approved" | "rejected" | "paused";

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
