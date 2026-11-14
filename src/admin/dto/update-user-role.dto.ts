import { IsEnum } from 'class-validator';
import { UserRole } from '../../users/user.entity';
import { AdminActionReasonDto } from "./admin-action-reason.dto";

export class UpdateUserRoleDto extends AdminActionReasonDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
