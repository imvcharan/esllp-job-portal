import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../users/user.entity";
import { UpdateTwilioConfigurationDto } from "./dto/update-twilio-configuration.dto";
import { TwilioConfigurationService } from "./twilio-configuration.service";

@Controller("admin/twilio-config")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class AdminTwilioConfigurationController {
  constructor(private readonly configuration: TwilioConfigurationService) {}

  @Get()
  get() {
    return this.configuration.adminView();
  }

  @Patch()
  update(
    @Body() dto: UpdateTwilioConfigurationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.configuration.update(dto, actor);
  }
}
