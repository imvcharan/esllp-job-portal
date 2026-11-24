import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { PlatformConfigurationModule } from "../platform-config/platform-configuration.module";
import { CandidateApplicationsController } from "./candidate-applications.controller";
import { CandidateApplicationsService } from "./candidate-applications.service";
import { CandidateDataModule } from "./candidate-data.module";
import { CandidateStorageModule } from "./candidate-storage.module";

@Module({
  imports: [
    CandidateDataModule,
    CandidateStorageModule,
    AuthModule,
    AuditModule,
    PlatformConfigurationModule,
  ],
  controllers: [CandidateApplicationsController],
  providers: [CandidateApplicationsService],
  exports: [CandidateApplicationsService],
})
export class CandidateApplicationsModule {}
