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
    ]),
    AuditModule,
    AuthModule,
  ],
  controllers: [
    AdminUsersController,
    AdminAuditController,
    AdminEmployersController,
    AdminInsightsController,
  ],
  providers: [AdminUsersService, AdminInsightsService],
})
export class AdminModule {}
