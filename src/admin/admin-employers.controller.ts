import { Controller, Get, UseGuards } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  EmployerApprovalStatus,
  User,
  UserRole,
} from "../users/user.entity";

@Controller("admin/employers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPERADMIN)
export class AdminEmployersController {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  @Get()
  list() {
    return this.usersRepository.find({
      select: { id: true, email: true, displayName: true },
      where: {
        role: UserRole.EMPLOYER,
        isActive: true,
        employerApprovalStatus: EmployerApprovalStatus.APPROVED,
      },
      order: { displayName: "ASC", id: "ASC" },
    });
  }
}
