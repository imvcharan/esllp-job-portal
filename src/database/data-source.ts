import "dotenv/config";
import { DataSource } from "typeorm";
import { getDatabaseConfig } from "./database.config";
import { CreateJobsTable1729000000000 } from "./migrations/1729000000000-CreateJobsTable";
import { CreateUsersAndRefreshSessions1729000000001 } from "./migrations/1729000000001-CreateUsersAndRefreshSessions";
import { Job } from "../jobs/job.entity";
import { RefreshSession } from "../auth/refresh-session.entity";
import { User } from "../users/user.entity";
import { AuditLog } from "../audit/audit-log.entity";
import { CreateAuditLogs1729000000002 } from "./migrations/1729000000002-CreateAuditLogs";
import { CreateCandidateProfiles1729000000003 } from "./migrations/1729000000003-CreateCandidateProfiles";
import { CandidateProfile } from "../users/candidate-profile.entity";
import { CandidateSavedJob } from "../users/candidate-saved-job.entity";
import { CreateCandidateSavedJobs1729000000004 } from "./migrations/1729000000004-CreateCandidateSavedJobs";
import { CandidateApplication } from "../users/candidate-application.entity";
import { CreateCandidateApplications1729000000005 } from "./migrations/1729000000005-CreateCandidateApplications";
import { ExpandCandidateProfiles1729000000006 } from "./migrations/1729000000006-ExpandCandidateProfiles";
import { AddAccountRecovery1729000000007 } from "./migrations/1729000000007-AddAccountRecovery";
import { ApplicationWorkflow1729000000008 } from "./migrations/1729000000008-ApplicationWorkflow";
import { AuthToken } from "../auth/auth-token.entity";
import { CandidateApplicationStatus } from "../users/candidate-application-status.entity";
import { EmployerRegistrationApproval1729000000009 } from "./migrations/1729000000009-EmployerRegistrationApproval";
import { EmployerSaasWorkspace1729000000010 } from "./migrations/1729000000010-EmployerSaasWorkspace";
import { EmployerOrganization } from "../employers/organization.entity";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";
import { EmployerApplicationNote } from "../employers/employer-application-note.entity";
import { EmployerApplicationTag } from "../employers/employer-application-tag.entity";
import { EmployerInterview } from "../employers/employer-interview.entity";
import { UserNotification } from "../employers/user-notification.entity";
import { RazorpayWebhookEvent } from "../employers/razorpay-webhook-event.entity";
import { CandidateSavedSearch } from "../users/candidate-saved-search.entity";
import { CreateCandidateSavedSearches1729000000011 } from "./migrations/1729000000011-CreateCandidateSavedSearches";
import { ExpandJobListingDetails1729000000012 } from "./migrations/1729000000012-ExpandJobListingDetails";
import { ExpandAuditLogDetails1729000000013 } from "./migrations/1729000000013-ExpandAuditLogDetails";
import { ManagedAccountsPasswordChange1729000000014 } from "./migrations/1729000000014-ManagedAccountsPasswordChange";
import { CreateReports1729000000015 } from "./migrations/1729000000015-CreateReports";
import { Report } from "../reports/report.entity";
import { CandidateDeletionRequest } from "../users/candidate-deletion-request.entity";
import { CandidateDeletionRequests1729000000016 } from "./migrations/1729000000016-CandidateDeletionRequests";
import { CandidateApplicationOffer } from "../users/candidate-application-offer.entity";
import { CandidateApplicationMessage } from "../users/candidate-application-message.entity";
import { CandidateWorkflowEnhancements1729000000017 } from "./migrations/1729000000017-CandidateWorkflowEnhancements";

export const AppDataSource = new DataSource({
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
    CandidateApplicationOffer,
    CandidateApplicationMessage,
    EmployerOrganization,
    EmployerOrganizationMember,
    EmployerApplicationNote,
    EmployerApplicationTag,
    EmployerInterview,
    UserNotification,
    RazorpayWebhookEvent,
    CandidateSavedSearch,
    Report,
    CandidateDeletionRequest,
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
    CreateCandidateSavedSearches1729000000011,
    ExpandJobListingDetails1729000000012,
    ExpandAuditLogDetails1729000000013,
    ManagedAccountsPasswordChange1729000000014,
    CreateReports1729000000015,
    CandidateDeletionRequests1729000000016,
    CandidateWorkflowEnhancements1729000000017,
  ],
  synchronize: false,
});
