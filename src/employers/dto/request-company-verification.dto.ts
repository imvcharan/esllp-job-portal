import { IsString, MaxLength, MinLength } from "class-validator";

export class RequestCompanyVerificationDto {
  @IsString()
  @MinLength(30)
  @MaxLength(2000)
  details!: string;
}
