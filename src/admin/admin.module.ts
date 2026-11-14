import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { User } from "../users/user.entity";
import { AdminUsersController } from "./admin-users.controller";
import { AdminAuditController } from "./admin-audit.controller";
import { AdminUsersService } from "./admin-users.service";
import { AdminEmployersController } from "./admin-employers.controller";
import { AdminInsightsController } from "./admin-insights.controller";
import { AdminInsightsService } from "./admin-insights.service";
import { Job } from "../jobs/job.entity";
import { CandidateApplication } from "../users/candidate-application.entity";
import { EmployerOrganization } from "../employers/organization.entity";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";
import { EmployerInterview } from "../employers/employer-interview.entity";
import { AuditLog } from "../audit/audit-log.entity";
import { AuthToken } from "../auth/auth-token.entity";
import { CandidateApplicationMessage } from "../users/candidate-application-message.entity";
import { CandidateApplicationStatus } from "../users/candidate-application-status.entity";
import { CandidateDeletionRequest } from "../users/candidate-deletion-request.entity";
import { CandidateProfile } from "../users/candidate-profile.entity";
import { CandidateSavedJob } from "../users/candidate-saved-job.entity";
import { CandidateSavedSearch } from "../users/candidate-saved-search.entity";
import { EmployerApplicationNote } from "../employers/employer-application-note.entity";
import { EmployerApplicationTag } from "../employers/employer-application-tag.entity";
import { UserNotification } from "../employers/user-notification.entity";
import { Report } from "../reports/report.entity";
import { CandidatePremiumProduct } from "../users/candidate-premium-product.entity";
import { CandidatePremiumOrder } from "../users/candidate-premium-order.entity";
import { AdminCandidatePremiumController } from "../users/candidate-premium.controller";
import { CandidatePremiumService } from "../users/candidate-premium.service";
import { PaymentsModule } from "../payments/payments.module";
import { AdminRazorpayConfigurationController } from "../payments/admin-razorpay-configuration.controller";
import { AdminEmailOutboxController } from "./admin-email-outbox.controller";
import { EmailNotificationOutbox } from "../notifications/email-notification-outbox.entity";
import { CandidateApplicationDocument } from "../users/candidate-application-document.entity";
import { CandidateResumeVersion } from "../users/candidate-resume-version.entity";
import { CandidateFileStorageService } from "../users/candidate-file-storage.service";
import { EmployerSubscriptionPayment } from "../employers/employer-subscription-payment.entity";
import { AdminPlatformConfigurationController } from "./admin-platform-configuration.controller";
import { PlatformConfigurationModule } from "../platform-config/platform-configuration.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminNotificationTemplatesController } from "./admin-notification-templates.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Job,
      CandidateApplication,
      EmployerOrganization,
      EmployerOrganizationMember,
      EmployerInterview,
      AuditLog,
      AuthToken,
      CandidateApplicationMessage,
      CandidateApplicationStatus,
      CandidateDeletionRequest,
      CandidateProfile,
      CandidateSavedJob,
      CandidateSavedSearch,
      EmployerApplicationNote,
      EmployerApplicationTag,
      UserNotification,
      Report,
      CandidatePremiumProduct,
      CandidatePremiumOrder,
      EmailNotificationOutbox,
      CandidateApplicationDocument,
      CandidateResumeVersion,
      EmployerSubscriptionPayment,
    ]),
    AuditModule,
    AuthModule,
    PaymentsModule,
    PlatformConfigurationModule,
    NotificationsModule,
  ],
  controllers: [
    AdminUsersController,
    AdminAuditController,
    AdminEmployersController,
    AdminInsightsController,
    AdminCandidatePremiumController,
    AdminRazorpayConfigurationController,
    AdminEmailOutboxController,
    AdminPlatformConfigurationController,
    AdminNotificationTemplatesController,
  ],
  providers: [
    AdminUsersService,
    AdminInsightsService,
    CandidatePremiumService,
    CandidateFileStorageService,
  ],
})
export class AdminModule {}
