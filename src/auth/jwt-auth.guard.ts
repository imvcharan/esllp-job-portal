import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Request } from "express";
import { Repository } from "typeorm";
import { AccessTokenPayload, AuthenticatedUser } from "./auth.types";
import { EmployerApprovalStatus, User, UserRole } from "../users/user.entity";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("A valid access token is required");
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException("The access token is invalid or expired");
    }

    if (!Number.isSafeInteger(payload.sub)) {
      throw new UnauthorizedException("The access token is invalid");
    }
    const user = await this.usersRepository.findOneBy({
      id: payload.sub,
      isActive: true,
    });
    if (!user) {
      throw new UnauthorizedException("This account is unavailable");
    }
    if (
      user.role === UserRole.EMPLOYER &&
      user.employerApprovalStatus !== EmployerApprovalStatus.APPROVED
    ) {
      throw new UnauthorizedException(
        "This employer account is not approved for dashboard access.",
      );
    }

    request.user = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
    return true;
  }
}
