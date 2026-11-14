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
import { CandidateAuthProfileEnhancements1729000000018 } from "./migrations/1729000000018-CandidateAuthProfileEnhancements";
import { CandidateResumeVersion } from "../users/candidate-resume-version.entity";
import { CandidatePremiumProduct } from "../users/candidate-premium-product.entity";
import { CandidatePremiumOrder } from "../users/candidate-premium-order.entity";
import { CandidatePremiumServices1729000000019 } from "./migrations/1729000000019-CandidatePremiumServices";
import { RazorpayConfiguration } from "../payments/razorpay-configuration.entity";
import { RazorpayDashboardConfiguration1729000000020 } from "./migrations/1729000000020-RazorpayDashboardConfiguration";
import { EmployerPlanCatalog1729000000021 } from "./migrations/1729000000021-EmployerPlanCatalog";
import { EmployerSavedSearch } from "../employers/employer-saved-search.entity";
import { EmployerSavedCandidateSearches1729000000022 } from "./migrations/1729000000022-EmployerSavedCandidateSearches";
import { EmployerCandidateResumeAccess1729000000023 } from "./migrations/1729000000023-EmployerCandidateResumeAccess";
import { JobApplicationQuestions1729000000024 } from "./migrations/1729000000024-JobApplicationQuestions";
import { JobModeration1729000000025 } from "./migrations/1729000000025-JobModeration";
import { EmployerApplicationScorecard } from "../employers/employer-application-scorecard.entity";
import { EmployerApplicationScorecards1729000000026 } from "./migrations/1729000000026-EmployerApplicationScorecards";
import { CandidateApplicationDocument } from "../users/candidate-application-document.entity";
import { RequiredApplicationDocuments1729000000027 } from "./migrations/1729000000027-RequiredApplicationDocuments";
import { EmailNotificationOutbox } from "../notifications/email-notification-outbox.entity";
import { EmailNotificationOutbox1729000000028 } from "./migrations/1729000000028-EmailNotificationOutbox";
import { EmailNotificationRetention1729000000029 } from "./migrations/1729000000029-EmailNotificationRetention";
import { PhoneVerificationAndUsernames1729000000030 } from "./migrations/1729000000030-PhoneVerificationAndUsernames";
import { AuditRequestId1729000000031 } from "./migrations/1729000000031-AuditRequestId";
import { ReportReporterMessage1729000000032 } from "./migrations/1729000000032-ReportReporterMessage";
import { ContentEntry } from "../content/content-entry.entity";
import { CreateContentEntries1729000000033 } from "./migrations/1729000000033-CreateContentEntries";
import { CandidateOnboardingProgress1729000000034 } from "./migrations/1729000000034-CandidateOnboardingProgress";
import { ContentEntryRevision } from "../content/content-entry-revision.entity";
import { CreateContentEntryRevisions1729000000035 } from "./migrations/1729000000035-CreateContentEntryRevisions";
import { EmployerSubscriptionPayment } from "../employers/employer-subscription-payment.entity";
import { EmployerSubscriptionPayments1729000000036 } from "./migrations/1729000000036-EmployerSubscriptionPayments";
import { AddHiredApplicationStatus1729000000037 } from "./migrations/1729000000037-AddHiredApplicationStatus";
import { PlatformConfiguration } from "../platform-config/platform-configuration.entity";
import { PlatformConfiguration1729000000038 } from "./migrations/1729000000038-PlatformConfiguration";
import { AdminJobTaxonomies1729000000039 } from "./migrations/1729000000039-AdminJobTaxonomies";
import { NotificationEmailTemplates1729000000040 } from "./migrations/1729000000040-NotificationEmailTemplates";
import { StructuredJobSkills1729000000041 } from "./migrations/1729000000041-StructuredJobSkills";
import { ConfigurableApplicationStages1729000000042 } from "./migrations/1729000000042-ConfigurableApplicationStages";
import { ApplicationSourceAttribution1729000000043 } from "./migrations/1729000000043-ApplicationSourceAttribution";
import { CandidateApplicationAssignee1729000000044 } from "./migrations/1729000000044-CandidateApplicationAssignee";
import { ConfigurableReportDefinitions1729000000045 } from "./migrations/1729000000045-ConfigurableReportDefinitions";
import { TwilioConfiguration } from "../providers/twilio-configuration.entity";
import { TwilioConfiguration1729000000046 } from "./migrations/1729000000046-TwilioConfiguration";
import {
  SuperadminMfa,
  SuperadminMfaRecoveryCode,
} from "../auth/superadmin-mfa.entity";
import { SuperadminMfa1729000000047 } from "./migrations/1729000000047-SuperadminMfa";
import { InterviewReminderTemplate1729000000048 } from "./migrations/1729000000048-InterviewReminderTemplate";
import { CandidateQuickApplyPreference } from "../users/candidate-quick-apply-preference.entity";
import { CandidateQuickApplyPreferences1729000000049 } from "./migrations/1729000000049-CandidateQuickApplyPreferences";
import { WhatsAppInterviewReminders1729000000050 } from "./migrations/1729000000050-WhatsAppInterviewReminders";

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
    CandidateResumeVersion,
    CandidatePremiumProduct,
    CandidatePremiumOrder,
    RazorpayConfiguration,
    EmployerSavedSearch,
    EmployerApplicationScorecard,
    CandidateApplicationDocument,
    EmailNotificationOutbox,
    ContentEntry,
    ContentEntryRevision,
    EmployerSubscriptionPayment,
    PlatformConfiguration,
    TwilioConfiguration,
    SuperadminMfa,
    SuperadminMfaRecoveryCode,
    CandidateQuickApplyPreference,
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
    CandidateAuthProfileEnhancements1729000000018,
    CandidatePremiumServices1729000000019,
    RazorpayDashboardConfiguration1729000000020,
    EmployerPlanCatalog1729000000021,
    EmployerSavedCandidateSearches1729000000022,
    EmployerCandidateResumeAccess1729000000023,
    JobApplicationQuestions1729000000024,
    JobModeration1729000000025,
    EmployerApplicationScorecards1729000000026,
    RequiredApplicationDocuments1729000000027,
    EmailNotificationOutbox1729000000028,
    EmailNotificationRetention1729000000029,
    PhoneVerificationAndUsernames1729000000030,
    AuditRequestId1729000000031,
    ReportReporterMessage1729000000032,
    CreateContentEntries1729000000033,
    CandidateOnboardingProgress1729000000034,
    CreateContentEntryRevisions1729000000035,
    EmployerSubscriptionPayments1729000000036,
    AddHiredApplicationStatus1729000000037,
    PlatformConfiguration1729000000038,
    AdminJobTaxonomies1729000000039,
    NotificationEmailTemplates1729000000040,
    StructuredJobSkills1729000000041,
    ConfigurableApplicationStages1729000000042,
    ApplicationSourceAttribution1729000000043,
    CandidateApplicationAssignee1729000000044,
    ConfigurableReportDefinitions1729000000045,
    TwilioConfiguration1729000000046,
    SuperadminMfa1729000000047,
    InterviewReminderTemplate1729000000048,
    CandidateQuickApplyPreferences1729000000049,
    WhatsAppInterviewReminders1729000000050,
  ],
  synchronize: false,
});
