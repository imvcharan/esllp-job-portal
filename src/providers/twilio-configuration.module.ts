import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { TwilioConfiguration } from "./twilio-configuration.entity";
import { TwilioConfigurationService } from "./twilio-configuration.service";
import { WhatsAppDeliveryService } from "./whatsapp-delivery.service";

@Module({
  imports: [TypeOrmModule.forFeature([TwilioConfiguration]), AuditModule],
  providers: [TwilioConfigurationService, WhatsAppDeliveryService],
  exports: [TwilioConfigurationService, WhatsAppDeliveryService],
})
export class TwilioConfigurationModule {}
