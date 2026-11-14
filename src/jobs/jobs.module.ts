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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Job,
      User,
      CandidateProfile,
      EmployerOrganizationMember,
      CandidateSavedSearch,
      CandidateApplication,
      CandidateSavedJob,
      Report,
      ContentEntry,
    ]),
    AuthModule,
    AuditModule,
    PlatformConfigurationModule,
  ],
  controllers: [JobsController, AdminJobsController, PublicJobPagesController],
  providers: [JobsService, CandidateSavedSearchesService],
  exports: [JobsService],
})
export class JobsModule {}
