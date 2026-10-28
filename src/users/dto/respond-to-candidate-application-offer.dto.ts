import { IsIn } from "class-validator";

export class RespondToCandidateApplicationOfferDto {
  @IsIn(["accepted", "declined"])
  decision!: "accepted" | "declined";
}
