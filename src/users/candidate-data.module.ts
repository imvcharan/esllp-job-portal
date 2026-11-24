import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CandidateProfile } from "./candidate-profile.entity";
import { User } from "./user.entity";
import { CandidateSavedJob } from "./candidate-saved-job.entity";
import { Job } from "../jobs/job.entity";
import { CandidateApplication } from "./candidate-application.entity";
import { CandidateApplicationStatus } from "./candidate-application-status.entity";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";
import { UserNotification } from "../employers/user-notification.entity";
import { CandidateSavedSearch } from "./candidate-saved-search.entity";
import { CandidateDeletionRequest } from "./candidate-deletion-request.entity";
import { CandidateApplicationOffer } from "./candidate-application-offer.entity";
import { CandidateApplicationMessage } from "./candidate-application-message.entity";
import { CandidateResumeVersion } from "./candidate-resume-version.entity";
import { EmployerInterview } from "../employers/employer-interview.entity";
import { CandidatePremiumProduct } from "./candidate-premium-product.entity";
import { CandidatePremiumOrder } from "./candidate-premium-order.entity";
import { CandidateApplicationDocument } from "./candidate-application-document.entity";
import { EmployerOrganization } from "../employers/organization.entity";
import { CandidateQuickApplyPreference } from "./candidate-quick-apply-preference.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CandidateProfile,
      CandidateSavedJob,
      CandidateApplication,
      CandidateApplicationDocument,
      CandidateQuickApplyPreference,
      CandidateApplicationStatus,
      CandidateApplicationOffer,
      CandidateApplicationMessage,
      CandidateResumeVersion,
      CandidatePremiumProduct,
      CandidatePremiumOrder,
      EmployerInterview,
      User,
      Job,
      EmployerOrganizationMember,
      EmployerOrganization,
      UserNotification,
      CandidateSavedSearch,
      CandidateDeletionRequest,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CandidateDataModule {}
