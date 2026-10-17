import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { AuditService } from "../audit/audit.service";
import { RefreshSession } from "../auth/refresh-session.entity";
import { EmployerApprovalStatus, User, UserRole } from "../users/user.entity";

type SafeUser = Pick<
  User,
  | "id"
  | "email"
  | "displayName"
  | "role"
  | "companyName"
  | "companyWebsite"
  | "employerApprovalStatus"
  | "emailVerified"
  | "isActive"
  | "createdAt"
  | "updatedAt"
>;

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async list(
    page = 1,
    limit = 25,
  ): Promise<{
    items: SafeUser[];
    total: number;
    page: number;
    limit: number;
  }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [items, total] = await this.usersRepository.findAndCount({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        companyName: true,
        companyWebsite: true,
        employerApprovalStatus: true,
        emailVerified: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      order: { createdAt: "DESC" },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    return { items, total, page: safePage, limit: safeLimit };
  }

  async changeRole(
    actorUserId: number,
    targetUserId: number,
    role: UserRole,
    ipAddress?: string,
  ): Promise<SafeUser> {
    if (role === UserRole.EMPLOYER) {
      throw new BadRequestException(
        "Employers must register through the employer registration form and be approved separately.",
      );
    }
    if (actorUserId === targetUserId && role !== UserRole.SUPERADMIN) {
      throw new BadRequestException(
        "You cannot remove your own superadmin role",
      );
    }
    const { saved, previousRole } =
      await this.usersRepository.manager.transaction(async (manager) => {
        const users = manager.getRepository(User);
        const user = await users.findOneBy({ id: targetUserId });
        if (!user) {
          throw new NotFoundException("User was not found");
        }
        if (
          user.role === UserRole.SUPERADMIN &&
          role !== UserRole.SUPERADMIN &&
          user.isActive
        ) {
          const activeSuperadmins = await users.countBy({
            role: UserRole.SUPERADMIN,
            isActive: true,
          });
          if (activeSuperadmins <= 1) {
            throw new BadRequestException(
              "The last active superadmin cannot be demoted",
            );
          }
        }
        const previousRole = user.role;
        user.role = role;
        user.employerApprovalStatus = EmployerApprovalStatus.NOT_APPLICABLE;
        if (previousRole !== role) {
          await manager
            .getRepository(RefreshSession)
            .update(
              { userId: targetUserId, revokedAt: IsNull() },
              { revokedAt: new Date() },
            );
        }
        return { saved: await users.save(user), previousRole };
      });
    await this.auditService.record({
      actorUserId,
      action: "user.role_changed",
      targetType: "user",
      targetId: targetUserId,
      details: { previousRole, newRole: role },
      ipAddress,
    });
    return this.toSafeUser(saved);
  }

  async changeStatus(
    actorUserId: number,
    targetUserId: number,
    isActive: boolean,
    ipAddress?: string,
  ): Promise<SafeUser> {
    if (actorUserId === targetUserId && !isActive) {
      throw new BadRequestException("You cannot deactivate your own account");
    }
    const { saved, previousStatus } =
      await this.usersRepository.manager.transaction(async (manager) => {
        const users = manager.getRepository(User);
        const user = await users.findOneBy({ id: targetUserId });
        if (!user) {
          throw new NotFoundException("User was not found");
        }
        if (user.role === UserRole.SUPERADMIN && user.isActive && !isActive) {
          const activeSuperadmins = await users.countBy({
            role: UserRole.SUPERADMIN,
            isActive: true,
          });
          if (activeSuperadmins <= 1) {
            throw new BadRequestException(
              "The last active superadmin cannot be deactivated",
            );
          }
        }
        const previousStatus = user.isActive;
        user.isActive = isActive;
        if (!isActive) {
          await manager
            .getRepository(RefreshSession)
            .update(
              { userId: targetUserId, revokedAt: IsNull() },
              { revokedAt: new Date() },
            );
        }
        return { saved: await users.save(user), previousStatus };
      });
    await this.auditService.record({
      actorUserId,
      action: isActive ? "user.activated" : "user.deactivated",
      targetType: "user",
      targetId: targetUserId,
      details: { previousStatus, isActive },
      ipAddress,
    });
    return this.toSafeUser(saved);
  }

  async setEmployerApproval(
    actorUserId: number,
    targetUserId: number,
    status: "approved" | "rejected",
    ipAddress?: string,
  ): Promise<SafeUser> {
    const saved = await this.usersRepository.manager.transaction(
      async (manager) => {
        const users = manager.getRepository(User);
        const user = await users.findOne({
          where: { id: targetUserId },
          lock: { mode: "pessimistic_write" },
        });
        if (!user) throw new NotFoundException("User was not found");
        if (user.role !== UserRole.EMPLOYER) {
          throw new BadRequestException(
            "Only employer accounts have an employer approval status.",
          );
        }
        if (status === "approved" && !user.emailVerified) {
          throw new BadRequestException(
            "The employer must verify their email before approval.",
          );
        }
        const previousStatus = user.employerApprovalStatus;
        user.employerApprovalStatus =
          status === "approved"
            ? EmployerApprovalStatus.APPROVED
            : EmployerApprovalStatus.REJECTED;
        const saved = await users.save(user);
        if (status === "rejected") {
          await manager
            .getRepository(RefreshSession)
            .update(
              { userId: targetUserId, revokedAt: IsNull() },
              { revokedAt: new Date() },
            );
        }
        return { saved, previousStatus };
      },
    );
    await this.auditService.record({
      actorUserId,
      action: `employer.${status}`,
      targetType: "user",
      targetId: targetUserId,
      details: {
        previousStatus: saved.previousStatus,
        newStatus: saved.saved.employerApprovalStatus,
        companyName: saved.saved.companyName,
      },
      ipAddress,
    });
    return this.toSafeUser(saved.saved);
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      companyName: user.companyName,
      companyWebsite: user.companyWebsite,
      employerApprovalStatus: user.employerApprovalStatus,
      emailVerified: user.emailVerified,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
