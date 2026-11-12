import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { RazorpayConfiguration } from "./razorpay-configuration.entity";
import { RazorpayConfigurationService } from "./razorpay-configuration.service";

@Module({
  imports: [TypeOrmModule.forFeature([RazorpayConfiguration]), AuditModule],
  providers: [RazorpayConfigurationService],
  exports: [RazorpayConfigurationService],
})
export class PaymentsModule {}
