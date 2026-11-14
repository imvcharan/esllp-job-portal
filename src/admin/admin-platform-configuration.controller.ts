import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../users/user.entity";
import {
  ResetPlatformConfigurationDto,
  UpdatePlatformConfigurationDto,
} from "./dto/update-platform-configuration.dto";
import { PlatformConfigurationService } from "../platform-config/platform-configuration.service";

@Controller("admin/platform-configuration")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class AdminPlatformConfigurationController {
  constructor(private readonly configuration: PlatformConfigurationService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  get() {
    return this.configuration.get();
  }

  @Put()
  update(
    @Body() dto: UpdatePlatformConfigurationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.configuration.update(
      {
        candidateRegistrationEnabled: dto.candidateRegistrationEnabled,
        employerRegistrationEnabled: dto.employerRegistrationEnabled,
        employerApprovalRequired: dto.employerApprovalRequired,
        jobApprovalRequired: dto.jobApprovalRequired,
        jobCategories: dto.jobCategories,
        industries: dto.industries,
        locations: dto.locations,
        employmentTypes: dto.employmentTypes,
        workplaceTypes: dto.workplaceTypes,
        applicationStages: dto.applicationStages,
        reportDefinitions: dto.reportDefinitions,
      },
      dto.reason,
      actor,
    );
  }

  @Post("reset")
  reset(
    @Body() dto: ResetPlatformConfigurationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.configuration.reset(dto.reason, actor);
  }
}
