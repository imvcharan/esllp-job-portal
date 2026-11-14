import {
  IsBoolean,
  IsObject,
  IsOptional,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApplicationSourceAttributionDto } from "./submit-candidate-application.dto";

export class SaveQuickApplyPreferenceDto {
  @IsBoolean()
  includeResume!: boolean;

  @IsBoolean()
  shareProfile!: boolean;
}

export class QuickApplyDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ApplicationSourceAttributionDto)
  sourceAttribution?: ApplicationSourceAttributionDto;
}
