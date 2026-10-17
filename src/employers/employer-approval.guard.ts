import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AuthenticatedUser } from "../auth/auth.types";
import { EmployerApprovalStatus, UserRole } from "../users/user.entity";

const PENDING_EMPLOYER_READ_ONLY = "pending-employer-read-only";

export const AllowPendingEmployerReadOnly = () =>
  SetMetadata(PENDING_EMPLOYER_READ_ONLY, true);

@Injectable()
export class EmployerApprovalGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (
      user?.role !== UserRole.EMPLOYER ||
      user.employerApprovalStatus === EmployerApprovalStatus.APPROVED
    ) {
      return true;
    }

    const isReadOnlyDashboardRoute =
      request.method === "GET" &&
      this.reflector.getAllAndOverride<boolean>(PENDING_EMPLOYER_READ_ONLY, [
        context.getHandler(),
      ]);
    if (
      user.employerApprovalStatus === EmployerApprovalStatus.PENDING &&
      isReadOnlyDashboardRoute
    ) {
      return true;
    }

    throw new ForbiddenException(
      "This pending employer account has read-only access until an administrator approves it.",
    );
  }
}
