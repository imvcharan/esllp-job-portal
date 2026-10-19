import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { CandidateProfileController } from "./candidate-profile.controller";
import { CandidateProfileService } from "./candidate-profile.service";
import { CandidateProfile } from "./candidate-profile.entity";
import { User } from "./user.entity";
import { CandidateSavedJob } from "./candidate-saved-job.entity";
import { CandidateSavedJobsController } from "./candidate-saved-jobs.controller";
import { CandidateSavedJobsService } from "./candidate-saved-jobs.service";
import { Job } from "../jobs/job.entity";
import { CandidateApplication } from "./candidate-application.entity";
import { CandidateApplicationsController } from "./candidate-applications.controller";
import { CandidateApplicationsService } from "./candidate-applications.service";
import { CandidateFileStorageService } from "./candidate-file-storage.service";
import { CandidateApplicationStatus } from "./candidate-application-status.entity";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";
import { UserNotification } from "../employers/user-notification.entity";
import { CandidateNotificationsController } from "./candidate-notifications.controller";
import { CandidateNotificationsService } from "./candidate-notifications.service";
import { CandidateSavedSearch } from "./candidate-saved-search.entity";
import { CandidateSavedSearchesController } from "./candidate-saved-searches.controller";
import { CandidateSavedSearchesService } from "./candidate-saved-searches.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CandidateProfile,
      CandidateSavedJob,
      CandidateApplication,
      CandidateApplicationStatus,
      User,
      Job,
      EmployerOrganizationMember,
      UserNotification,
      CandidateSavedSearch,
    ]),
    AuthModule,
    AuditModule,
  ],
  controllers: [
    CandidateProfileController,
    CandidateSavedJobsController,
    CandidateApplicationsController,
    CandidateNotificationsController,
    CandidateSavedSearchesController,
  ],
  providers: [
    CandidateProfileService,
    CandidateSavedJobsService,
    CandidateApplicationsService,
    CandidateNotificationsService,
    CandidateSavedSearchesService,
    CandidateFileStorageService,
  ],
  exports: [CandidateApplicationsService, CandidateFileStorageService],
})
export class CandidateProfileModule {}
