import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { CandidateDataModule } from "./candidate-data.module";
import {
  AdminPrivacyRequestsController,
  CandidateAccountController,
} from "./candidate-account.controller";
import { CandidateAccountService } from "./candidate-account.service";

@Module({
  imports: [CandidateDataModule, AuthModule, AuditModule],
  controllers: [CandidateAccountController, AdminPrivacyRequestsController],
  providers: [CandidateAccountService],
})
export class CandidateAccountModule {}
