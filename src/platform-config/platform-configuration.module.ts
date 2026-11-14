import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { CandidateApplication } from "../users/candidate-application.entity";
import { PlatformConfiguration } from "./platform-configuration.entity";
import { PlatformConfigurationService } from "./platform-configuration.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformConfiguration, CandidateApplication]),
    AuditModule,
  ],
  providers: [PlatformConfigurationService],
  exports: [PlatformConfigurationService],
})
export class PlatformConfigurationModule {}
