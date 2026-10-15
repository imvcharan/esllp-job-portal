import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { CreateJobsTable1729000000000 } from './migrations/1729000000000-CreateJobsTable';
import { CreateUsersAndRefreshSessions1729000000001 } from './migrations/1729000000001-CreateUsersAndRefreshSessions';
import { Job } from '../jobs/job.entity';
import { RefreshSession } from '../auth/refresh-session.entity';
import { User } from '../users/user.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { CreateAuditLogs1729000000002 } from './migrations/1729000000002-CreateAuditLogs';

const databasePath = resolve(
  process.env.SQLITE_DB_PATH ?? 'data/esllp.sqlite',
);
mkdirSync(dirname(databasePath), { recursive: true });

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: databasePath,
  entities: [Job, User, RefreshSession, AuditLog],
  migrations: [
    CreateJobsTable1729000000000,
    CreateUsersAndRefreshSessions1729000000001,
    CreateAuditLogs1729000000002,
  ],
  synchronize: false,
});

export default AppDataSource;
