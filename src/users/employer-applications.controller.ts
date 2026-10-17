import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UpdateApplicationStatusDto } from "./dto/update-application-status.dto";
import { CandidateApplicationsService } from "./candidate-applications.service";
import { UserRole } from "./user.entity";
import { EmployerApprovalGuard } from "../employers/employer-approval.guard";

@Controller("employer/applications")
@UseGuards(JwtAuthGuard, RolesGuard, EmployerApprovalGuard)
@Roles(UserRole.EMPLOYER)
export class EmployerApplicationsController {
  constructor(
    private readonly applicationsService: CandidateApplicationsService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.applicationsService.listForEmployer(user);
  }

  @Patch(":applicationId/status")
  @Header("Cache-Control", "private, no-store")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId", ParseIntPipe) applicationId: number,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationsService.updateStatus(
      user,
      applicationId,
      dto.status,
      dto.note,
    );
  }
}
