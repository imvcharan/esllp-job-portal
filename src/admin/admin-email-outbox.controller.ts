import {
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { EmailDeliveryService } from "../auth/email-delivery.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../users/user.entity";
import { AuditService } from "../audit/audit.service";
import { RetryEmailNotificationDto } from "./dto/retry-email-notification.dto";

@Controller("admin/email-outbox")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPERADMIN)
export class AdminEmailOutboxController {
  constructor(
    private readonly emailDelivery: EmailDeliveryService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  summary() {
    return this.emailDelivery.outboxSummary();
  }

  @Post(":id/retry")
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async retry(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: RetryEmailNotificationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const retried = await this.emailDelivery.retryFailedNotification(id);
    if (!retried)
      throw new ConflictException(
        "Only a failed email notification with retained delivery content can be retried.",
      );
    await this.audit.record({
      actorUserId: user.id,
      action: "admin.email_notification_retried",
      targetType: "email_notification",
      targetId: id,
      details: { reason: dto.reason.trim() },
    });
    return { queued: true };
  }
}
