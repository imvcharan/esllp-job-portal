import { UserRole } from '../users/user.entity';

export interface AuthenticatedUser {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface AccessTokenPayload {
  sub: number;
}
