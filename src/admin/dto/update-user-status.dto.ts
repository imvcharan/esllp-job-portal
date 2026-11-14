import { IsBoolean } from 'class-validator';
import { AdminActionReasonDto } from "./admin-action-reason.dto";

export class UpdateUserStatusDto extends AdminActionReasonDto {
  @IsBoolean()
  isActive!: boolean;
}
