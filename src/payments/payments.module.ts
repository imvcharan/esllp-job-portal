import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { RazorpayConfiguration } from "./razorpay-configuration.entity";
import { RazorpayConfigurationService } from "./razorpay-configuration.service";
import { PaymentCoupon } from "./payment-coupon.entity";
import { PaymentRefund } from "./payment-refund.entity";
import { PaymentInvoice } from "./payment-invoice.entity";
import { CommercialControlsService } from "./commercial-controls.service";
import { AdminCommercialControlsController } from "./commercial-controls.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RazorpayConfiguration,
      PaymentCoupon,
      PaymentRefund,
      PaymentInvoice,
    ]),
    AuthModule,
    AuditModule,
  ],
  controllers: [AdminCommercialControlsController],
  providers: [RazorpayConfigurationService, CommercialControlsService],
  exports: [RazorpayConfigurationService, CommercialControlsService],
})
export class PaymentsModule {}
