import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { Job } from "./job.entity";
import { JobsController } from "./jobs.controller";
import { AdminJobsController } from "./admin-jobs.controller";
import { JobsService } from "./jobs.service";
import { User } from "../users/user.entity";
import { CandidateProfile } from "../users/candidate-profile.entity";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Job,
      User,
      CandidateProfile,
      EmployerOrganizationMember,
    ]),
    AuthModule,
    AuditModule,
  ],
  controllers: [JobsController, AdminJobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
