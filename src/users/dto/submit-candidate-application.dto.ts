import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class ApplicationSourceAttributionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$/)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$/)
  medium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$/)
  campaign?: string;
}

export class SubmitCandidateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coverLetter?: string;

  @IsOptional()
  @IsBoolean()
  includeResume?: boolean;

  @IsOptional()
  @IsBoolean()
  shareProfile?: boolean;

  @IsOptional()
  @IsObject()
  answers?: Record<string, string>;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ApplicationSourceAttributionDto)
  sourceAttribution?: ApplicationSourceAttributionDto;
}
