import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RetrySearchIndexRecordDto {
  @IsString()
  @Matches(/\S/)
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
