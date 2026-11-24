import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { PaymentsModule } from "../payments/payments.module";
import { CandidateDataModule } from "./candidate-data.module";
import {
  CandidatePremiumController,
  CandidatePremiumWebhookController,
} from "./candidate-premium.controller";
import { CandidatePremiumService } from "./candidate-premium.service";

@Module({
  imports: [CandidateDataModule, AuthModule, AuditModule, PaymentsModule],
  controllers: [CandidatePremiumController, CandidatePremiumWebhookController],
  providers: [CandidatePremiumService],
})
export class CandidatePremiumModule {}
