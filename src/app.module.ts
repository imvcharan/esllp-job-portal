import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { AuditLog } from './audit/audit-log.entity';
import { CreateAuditLogs1729000000002 } from './database/migrations/1729000000002-CreateAuditLogs';
import { JobsModule } from './jobs/jobs.module';
import { Job } from './jobs/job.entity';
import { CreateJobsTable1729000000000 } from './database/migrations/1729000000000-CreateJobsTable';
import { CreateUsersAndRefreshSessions1729000000001 } from './database/migrations/1729000000001-CreateUsersAndRefreshSessions';
import { RefreshSession } from './auth/refresh-session.entity';
import { User } from './users/user.entity';
import { getDatabaseConfig } from './database/database.config';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TypeOrmModule.forRoot({
      ...getDatabaseConfig(),
      entities: [Job, User, RefreshSession, AuditLog],
      migrations: [
        CreateJobsTable1729000000000,
        CreateUsersAndRefreshSessions1729000000001,
        CreateAuditLogs1729000000002,
      ],
      migrationsRun: true,
      synchronize: false,
    }),
    AuthModule,
    AdminModule,
    JobsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
