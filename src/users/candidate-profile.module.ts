import { Module } from "@nestjs/common";
import { CandidateAccountModule } from "./candidate-account.module";
import { CandidateApplicationsModule } from "./candidate-applications.module";
import { CandidateEngagementModule } from "./candidate-engagement.module";
import { CandidatePremiumModule } from "./candidate-premium.module";
import { CandidateProfileFeaturesModule } from "./candidate-profile-features.module";
import { CandidateStorageModule } from "./candidate-storage.module";

@Module({
  imports: [
    CandidateProfileFeaturesModule,
    CandidateApplicationsModule,
    CandidateEngagementModule,
    CandidateAccountModule,
    CandidatePremiumModule,
    CandidateStorageModule,
  ],
  exports: [CandidateApplicationsModule, CandidateStorageModule],
})
export class CandidateProfileModule {}
