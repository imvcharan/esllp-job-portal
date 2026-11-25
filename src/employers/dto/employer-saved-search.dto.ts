import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateEmployerSavedSearchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  query!: string;

  @IsOptional()
  @IsBoolean()
  shareWithTeam?: boolean;
}
