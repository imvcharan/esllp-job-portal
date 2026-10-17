import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { User } from "../users/user.entity";
import { AdminUsersController } from "./admin-users.controller";
import { AdminAuditController } from "./admin-audit.controller";
import { AdminUsersService } from "./admin-users.service";
import { AdminEmployersController } from "./admin-employers.controller";
import { AdminInsightsController } from "./admin-insights.controller";
import { AdminInsightsService } from "./admin-insights.service";
import { Job } from "../jobs/job.entity";
import { CandidateApplication } from "../users/candidate-application.entity";
import { EmployerOrganization } from "../employers/organization.entity";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";
import { EmployerInterview } from "../employers/employer-interview.entity";
import { AuditLog } from "../audit/audit-log.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Job,
      CandidateApplication,
      EmployerOrganization,
      EmployerOrganizationMember,
      EmployerInterview,
      AuditLog,
    ]),
    AuditModule,
    AuthModule,
  ],
  controllers: [
    AdminUsersController,
    AdminAuditController,
    AdminEmployersController,
    AdminInsightsController,
  ],
  providers: [AdminUsersService, AdminInsightsService],
})
export class AdminModule {}
