import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { CandidateInterviewsController } from "./candidate-interviews.controller";
import { CandidateInterviewsService } from "./candidate-interviews.service";
import { CandidateNotificationsController } from "./candidate-notifications.controller";
import { CandidateNotificationsService } from "./candidate-notifications.service";
import { CandidateSavedJobsController } from "./candidate-saved-jobs.controller";
import { CandidateSavedJobsService } from "./candidate-saved-jobs.service";
import { CandidateSavedSearchesController } from "./candidate-saved-searches.controller";
import { CandidateSavedSearchesService } from "./candidate-saved-searches.service";
import { CandidateDataModule } from "./candidate-data.module";

@Module({
  imports: [CandidateDataModule, AuthModule, AuditModule],
  controllers: [
    CandidateInterviewsController,
    CandidateNotificationsController,
    CandidateSavedJobsController,
    CandidateSavedSearchesController,
  ],
  providers: [
    CandidateInterviewsService,
    CandidateNotificationsService,
    CandidateSavedJobsService,
    CandidateSavedSearchesService,
  ],
})
export class CandidateEngagementModule {}
