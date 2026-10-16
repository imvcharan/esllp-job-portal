import 'dotenv/config';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from './database.config';
import { CreateJobsTable1729000000000 } from './migrations/1729000000000-CreateJobsTable';
import { CreateUsersAndRefreshSessions1729000000001 } from './migrations/1729000000001-CreateUsersAndRefreshSessions';
import { Job } from '../jobs/job.entity';
import { RefreshSession } from '../auth/refresh-session.entity';
import { User } from '../users/user.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { CreateAuditLogs1729000000002 } from './migrations/1729000000002-CreateAuditLogs';
import { CreateCandidateProfiles1729000000003 } from './migrations/1729000000003-CreateCandidateProfiles';
import { CandidateProfile } from '../users/candidate-profile.entity';
import { CandidateSavedJob } from '../users/candidate-saved-job.entity';
import { CreateCandidateSavedJobs1729000000004 } from './migrations/1729000000004-CreateCandidateSavedJobs';
import { CandidateApplication } from '../users/candidate-application.entity';
import { CreateCandidateApplications1729000000005 } from './migrations/1729000000005-CreateCandidateApplications';

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
  ],
  migrations: [
    CreateJobsTable1729000000000,
    CreateUsersAndRefreshSessions1729000000001,
    CreateAuditLogs1729000000002,
    CreateCandidateProfiles1729000000003,
    CreateCandidateSavedJobs1729000000004,
    CreateCandidateApplications1729000000005,
  ],
  synchronize: false,
});
