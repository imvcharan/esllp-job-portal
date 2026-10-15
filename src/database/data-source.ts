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

export const AppDataSource = new DataSource({
  ...getDatabaseConfig(),
  entities: [Job, User, RefreshSession, AuditLog],
  migrations: [
    CreateJobsTable1729000000000,
    CreateUsersAndRefreshSessions1729000000001,
    CreateAuditLogs1729000000002,
  ],
  synchronize: false,
});

export default AppDataSource;
