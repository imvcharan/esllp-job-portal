import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateTwilioConfigurationDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountSid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  authToken?: string;

  @IsOptional()
  @IsBoolean()
  clearAuthToken?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fromNumber?: string;

  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  whatsappFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  whatsappTemplateSid?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
