import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { JobsModule } from "../jobs/jobs.module";
import { CandidateProfileModule } from "../users/candidate-profile.module";
import { CandidateApplication } from "../users/candidate-application.entity";
import { CandidateApplicationStatus } from "../users/candidate-application-status.entity";
import { CandidateFileStorageService } from "../users/candidate-file-storage.service";
import { Job } from "../jobs/job.entity";
import { User } from "../users/user.entity";
import { EmployerApplicationNote } from "./employer-application-note.entity";
import { EmployerApplicationTag } from "./employer-application-tag.entity";
import { EmployerInterview } from "./employer-interview.entity";
import { EmployerOrganizationMember } from "./organization-member.entity";
import { EmployerOrganization } from "./organization.entity";
import { RazorpayWebhookEvent } from "./razorpay-webhook-event.entity";
import { UserNotification } from "./user-notification.entity";
import { EmployersController } from "./employers.controller";
import { RazorpayWebhookController } from "./razorpay-webhook.controller";
import { EmployersService } from "./employers.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployerOrganization,
      EmployerOrganizationMember,
      EmployerApplicationNote,
      EmployerApplicationTag,
      EmployerInterview,
      UserNotification,
      RazorpayWebhookEvent,
      CandidateApplication,
      CandidateApplicationStatus,
      Job,
      User,
    ]),
    AuthModule,
    AuditModule,
    JobsModule,
    CandidateProfileModule,
  ],
  controllers: [EmployersController, RazorpayWebhookController],
  providers: [EmployersService],
})
export class EmployersModule {}
