import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { Job } from "./job.entity";
import { JobsController } from "./jobs.controller";
import { AdminJobsController } from "./admin-jobs.controller";
import { JobsService } from "./jobs.service";
import { User } from "../users/user.entity";
import { CandidateProfile } from "../users/candidate-profile.entity";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";
import { CandidateSavedSearch } from "../users/candidate-saved-search.entity";
import { CandidateSavedSearchesService } from "../users/candidate-saved-searches.service";
import { PublicJobPagesController } from "./public-job-pages.controller";
import { CandidateApplication } from "../users/candidate-application.entity";
import { CandidateSavedJob } from "../users/candidate-saved-job.entity";
import { Report } from "../reports/report.entity";
import { ContentEntry } from "../content/content-entry.entity";
import { PlatformConfigurationModule } from "../platform-config/platform-configuration.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { CandidateStorageModule } from "../users/candidate-storage.module";
import { EmployerOrganization } from "../employers/organization.entity";
import { PaymentsModule } from "../payments/payments.module";
import { FeaturedJobPlacement } from "../employers/featured-job-placement.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Job,
      User,
      CandidateProfile,
      EmployerOrganizationMember,
      EmployerOrganization,
      FeaturedJobPlacement,
      CandidateSavedSearch,
      CandidateApplication,
      CandidateSavedJob,
      Report,
      ContentEntry,
    ]),
    AuthModule,
    AuditModule,
    PlatformConfigurationModule,
    InfrastructureModule,
    CandidateStorageModule,
    PaymentsModule,
  ],
  controllers: [JobsController, AdminJobsController, PublicJobPagesController],
  providers: [JobsService, CandidateSavedSearchesService],
  exports: [JobsService],
})
export class JobsModule {}
