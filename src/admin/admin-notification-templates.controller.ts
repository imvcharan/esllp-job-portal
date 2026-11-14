import {
  Body,
  Controller,
  Get,
  Header,
  Param,
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
import { AdminActionReasonDto } from "./dto/admin-action-reason.dto";
import { UpdateNotificationTemplateDto } from "./dto/update-notification-template.dto";
import { NotificationTemplatesService } from "../notifications/notification-templates.service";

@Controller("admin/notification-templates")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class AdminNotificationTemplatesController {
  constructor(private readonly templates: NotificationTemplatesService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list() {
    return this.templates.list();
  }

  @Put(":key")
  update(
    @Param("key") key: string,
    @Body() dto: UpdateNotificationTemplateDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.templates.update(key, dto.subject, dto.body, dto.reason, actor);
  }

  @Post(":key/reset")
  reset(
    @Param("key") key: string,
    @Body() dto: AdminActionReasonDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.templates.reset(key, dto.reason, actor);
  }
}
