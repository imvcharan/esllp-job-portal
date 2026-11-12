import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../users/user.entity";
import { UpdateRazorpayConfigurationDto } from "./dto/update-razorpay-configuration.dto";
import { RazorpayConfigurationService } from "./razorpay-configuration.service";

@Controller("admin/razorpay-config")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class AdminRazorpayConfigurationController {
  constructor(private readonly configuration: RazorpayConfigurationService) {}

  @Get()
  get() {
    return this.configuration.adminView();
  }

  @Patch()
  update(
    @Body() dto: UpdateRazorpayConfigurationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.configuration.update(dto, actor);
  }

  @Post("test")
  testConnection() {
    return this.configuration.testConnection();
  }
}
