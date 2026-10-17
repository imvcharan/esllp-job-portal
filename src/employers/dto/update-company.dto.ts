import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"])
  companySize?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;
}
