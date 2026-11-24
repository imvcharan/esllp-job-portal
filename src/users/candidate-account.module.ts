import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { CandidateDataModule } from "./candidate-data.module";
import { CandidateStorageModule } from "./candidate-storage.module";
import {
  AdminPrivacyRequestsController,
  CandidateAccountController,
} from "./candidate-account.controller";
import { CandidateAccountService } from "./candidate-account.service";
import { CandidateDeletionProcessor } from "./candidate-deletion-processor.service";

@Module({
  imports: [
    CandidateDataModule,
    CandidateStorageModule,
    InfrastructureModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [CandidateAccountController, AdminPrivacyRequestsController],
  providers: [CandidateAccountService, CandidateDeletionProcessor],
})
export class CandidateAccountModule {}
