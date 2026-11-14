import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class UpdateApplicationStatusDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,19}$/)
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
