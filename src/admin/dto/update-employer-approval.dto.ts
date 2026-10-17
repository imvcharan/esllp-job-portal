import { IsIn } from "class-validator";

export class UpdateEmployerApprovalDto {
  @IsIn(["approved", "rejected"])
  status!: "approved" | "rejected";
}
