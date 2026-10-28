import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateApplicationStatusDto {
  @IsIn(["in_review", "interview", "rejected"])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
