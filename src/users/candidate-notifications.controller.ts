import {
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "./user.entity";
import { CandidateNotificationsService } from "./candidate-notifications.service";

@Controller("candidate/notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidateNotificationsController {
  constructor(
    private readonly notificationsService: CandidateNotificationsService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
  ) {
    return this.notificationsService.list(user, page);
  }

  @Patch(":notificationId/read")
  @Header("Cache-Control", "private, no-store")
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param("notificationId", ParseIntPipe) notificationId: number,
  ) {
    return this.notificationsService.markRead(user, notificationId);
  }
}
