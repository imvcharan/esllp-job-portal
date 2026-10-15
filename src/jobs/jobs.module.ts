import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { Job } from './job.entity';
import { JobsController } from './jobs.controller';
import { AdminJobsController } from './admin-jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Job]), AuthModule, AuditModule],
  controllers: [JobsController, AdminJobsController],
  providers: [JobsService],
})
export class JobsModule {}
