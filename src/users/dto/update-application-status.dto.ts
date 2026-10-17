import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateApplicationStatusDto {
  @IsIn(["in_review", "interview", "offer", "rejected"])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
