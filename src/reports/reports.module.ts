import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { EmployerOrganization } from "../employers/organization.entity";
import { Job } from "../jobs/job.entity";
import { User } from "../users/user.entity";
import {
  AdminReportsController,
  ReportsController,
} from "./reports.controller";
import { Report } from "./report.entity";
import { ReportsService } from "./reports.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, Job, EmployerOrganization, User]),
    AuthModule,
    AuditModule,
  ],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
