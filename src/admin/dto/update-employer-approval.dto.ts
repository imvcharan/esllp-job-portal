import { IsIn } from "class-validator";
import { AdminActionReasonDto } from "./admin-action-reason.dto";

export class UpdateEmployerApprovalDto extends AdminActionReasonDto {
  @IsIn(["approved", "rejected"])
  status!: "approved" | "rejected";
}
