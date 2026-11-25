import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export class CreateFeaturedPlacementDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  jobId!: number;

  @IsIn(["homepage", "search", "email"])
  placementType!: "homepage" | "search" | "email";

  @IsDateString()
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt!: string;

  @IsDateString()
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentReference?: string | null;
}
