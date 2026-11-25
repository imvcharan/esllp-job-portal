import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { EmployerApprovalStatus, User, UserRole } from "../users/user.entity";
import { EmployerOrganization } from "../employers/organization.entity";
import { ReviewCompanyVerificationDto } from "./dto/review-company-verification.dto";

@Controller("admin/employers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPERADMIN)
export class AdminEmployersController {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(EmployerOrganization)
    private readonly organizations: Repository<EmployerOrganization>,
    private readonly audit: AuditService,
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

  @Get("organizations/verification")
  pendingCompanyVerifications() {
    return this.organizations.find({
      select: {
        id: true,
        name: true,
        website: true,
        industry: true,
        verificationStatus: true,
        verificationDetails: true,
        verificationRequestedAt: true,
      },
      where: { verificationStatus: "pending" },
      order: { verificationRequestedAt: "ASC", id: "ASC" },
    });
  }

  @Patch("organizations/:id/verification")
  async reviewCompanyVerification(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ReviewCompanyVerificationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const organization = await this.organizations.findOneBy({ id });
    if (!organization)
      throw new NotFoundException("Company workspace was not found.");
    if (organization.verificationStatus !== "pending")
      throw new ConflictException(
        "Only pending company-verification requests can be reviewed.",
      );
    organization.verificationStatus = dto.status;
    organization.verificationNote = dto.reason.trim();
    organization.verifiedAt = dto.status === "verified" ? new Date() : null;
    const saved = await this.organizations.save(organization);
    await this.audit.record({
      actorUserId: actor.id,
      action: `admin.company_verification_${dto.status}`,
      targetType: "employer_organization",
      targetId: saved.id,
      details: { reason: saved.verificationNote },
    });
    return {
      id: saved.id,
      verificationStatus: saved.verificationStatus,
      verificationNote: saved.verificationNote,
      verifiedAt: saved.verifiedAt,
    };
  }
}
