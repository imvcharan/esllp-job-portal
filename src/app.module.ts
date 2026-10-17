import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { AuditLog } from "./audit/audit-log.entity";
import { CreateAuditLogs1729000000002 } from "./database/migrations/1729000000002-CreateAuditLogs";
import { JobsModule } from "./jobs/jobs.module";
import { Job } from "./jobs/job.entity";
import { CreateJobsTable1729000000000 } from "./database/migrations/1729000000000-CreateJobsTable";
import { CreateUsersAndRefreshSessions1729000000001 } from "./database/migrations/1729000000001-CreateUsersAndRefreshSessions";
import { RefreshSession } from "./auth/refresh-session.entity";
import { User } from "./users/user.entity";
import { getDatabaseConfig } from "./database/database.config";
import { CandidateProfileModule } from "./users/candidate-profile.module";
import { CandidateProfile } from "./users/candidate-profile.entity";
import { CreateCandidateProfiles1729000000003 } from "./database/migrations/1729000000003-CreateCandidateProfiles";
import { CandidateSavedJob } from "./users/candidate-saved-job.entity";
import { CreateCandidateSavedJobs1729000000004 } from "./database/migrations/1729000000004-CreateCandidateSavedJobs";
import { CandidateApplication } from "./users/candidate-application.entity";
import { CreateCandidateApplications1729000000005 } from "./database/migrations/1729000000005-CreateCandidateApplications";
import { ExpandCandidateProfiles1729000000006 } from "./database/migrations/1729000000006-ExpandCandidateProfiles";
import { AuthToken } from "./auth/auth-token.entity";
import { AddAccountRecovery1729000000007 } from "./database/migrations/1729000000007-AddAccountRecovery";
import { ApplicationWorkflow1729000000008 } from "./database/migrations/1729000000008-ApplicationWorkflow";
import { CandidateApplicationStatus } from "./users/candidate-application-status.entity";
import { EmployerRegistrationApproval1729000000009 } from "./database/migrations/1729000000009-EmployerRegistrationApproval";
import { EmployerSaasWorkspace1729000000010 } from "./database/migrations/1729000000010-EmployerSaasWorkspace";
import { EmployerOrganization } from "./employers/organization.entity";
import { EmployerOrganizationMember } from "./employers/organization-member.entity";
import { EmployerApplicationNote } from "./employers/employer-application-note.entity";
import { EmployerApplicationTag } from "./employers/employer-application-tag.entity";
import { EmployerInterview } from "./employers/employer-interview.entity";
import { UserNotification } from "./employers/user-notification.entity";
import { RazorpayWebhookEvent } from "./employers/razorpay-webhook-event.entity";
import { EmployersModule } from "./employers/employers.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TypeOrmModule.forRoot({
      ...getDatabaseConfig(),
      entities: [
        Job,
        User,
        RefreshSession,
        AuditLog,
        CandidateProfile,
        CandidateSavedJob,
        CandidateApplication,
        AuthToken,
        CandidateApplicationStatus,
        EmployerOrganization,
        EmployerOrganizationMember,
        EmployerApplicationNote,
        EmployerApplicationTag,
        EmployerInterview,
        UserNotification,
        RazorpayWebhookEvent,
      ],
      migrations: [
        CreateJobsTable1729000000000,
        CreateUsersAndRefreshSessions1729000000001,
        CreateAuditLogs1729000000002,
        CreateCandidateProfiles1729000000003,
        CreateCandidateSavedJobs1729000000004,
        CreateCandidateApplications1729000000005,
        ExpandCandidateProfiles1729000000006,
        AddAccountRecovery1729000000007,
        ApplicationWorkflow1729000000008,
        EmployerRegistrationApproval1729000000009,
        EmployerSaasWorkspace1729000000010,
      ],
      migrationsRun: true,
      synchronize: false,
    }),
    AuthModule,
    AdminModule,
    JobsModule,
    CandidateProfileModule,
    EmployersModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
