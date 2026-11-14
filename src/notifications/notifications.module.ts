import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { NotificationTemplatesService } from "./notification-templates.service";

@Module({
  imports: [AuditModule],
  providers: [NotificationTemplatesService],
  exports: [NotificationTemplatesService],
})
export class NotificationsModule {}
