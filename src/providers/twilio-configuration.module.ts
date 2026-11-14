import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { AdminTwilioConfigurationController } from "./admin-twilio-configuration.controller";
import { TwilioConfiguration } from "./twilio-configuration.entity";
import { TwilioConfigurationService } from "./twilio-configuration.service";
import { WhatsAppDeliveryService } from "./whatsapp-delivery.service";

@Module({
  imports: [TypeOrmModule.forFeature([TwilioConfiguration]), AuditModule],
  controllers: [AdminTwilioConfigurationController],
  providers: [TwilioConfigurationService, WhatsAppDeliveryService],
  exports: [TwilioConfigurationService, WhatsAppDeliveryService],
})
export class TwilioConfigurationModule {}
