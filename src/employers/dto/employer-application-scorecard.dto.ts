import { IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class EmployerApplicationScorecardDto {
  @IsObject()
  scores!: Record<string, number>;

  @IsIn(["strong_yes", "yes", "maybe", "no"])
  recommendation!: "strong_yes" | "yes" | "maybe" | "no";

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
