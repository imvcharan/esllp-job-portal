import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { PlatformConfigurationModule } from "../platform-config/platform-configuration.module";
import { CandidateDataModule } from "./candidate-data.module";
import { CandidateProfileController } from "./candidate-profile.controller";
import { CandidateProfileService } from "./candidate-profile.service";
import { CandidateRecommendationsController } from "./candidate-recommendations.controller";
import { CandidateRecommendationsService } from "./candidate-recommendations.service";
import { PublicUserProfileController } from "./public-user-profile.controller";
import { CandidateStorageModule } from "./candidate-storage.module";

@Module({
  imports: [
    CandidateDataModule,
    CandidateStorageModule,
    AuthModule,
    AuditModule,
    InfrastructureModule,
    PlatformConfigurationModule,
  ],
  controllers: [
    CandidateProfileController,
    PublicUserProfileController,
    CandidateRecommendationsController,
  ],
  providers: [CandidateProfileService, CandidateRecommendationsService],
})
export class CandidateProfileFeaturesModule {}
