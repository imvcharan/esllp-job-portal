import { EmployerApprovalStatus, UserRole } from "../users/user.entity";

export interface AuthenticatedUser {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  employerApprovalStatus: EmployerApprovalStatus;
}

export interface AccessTokenPayload {
  sub: number;
}
