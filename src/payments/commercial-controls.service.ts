import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PaymentCoupon } from "./payment-coupon.entity";
import { PaymentRefund } from "./payment-refund.entity";
import {
  CreatePaymentCouponDto,
  CreatePaymentRefundDto,
  ReviewPaymentRefundDto,
} from "./dto/commercial-control.dto";

@Injectable()
export class CommercialControlsService {
  constructor(
    @InjectRepository(PaymentCoupon)
    private readonly coupons: Repository<PaymentCoupon>,
    @InjectRepository(PaymentRefund)
    private readonly refunds: Repository<PaymentRefund>,
    private readonly audit: AuditService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async createCoupon(dto: CreatePaymentCouponDto, actor: AuthenticatedUser) {
    const code = dto.code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) {
      throw new BadRequestException("Coupon codes may contain letters, numbers, hyphens, and underscores.");
    }
    if (dto.discountType === "percentage" && dto.discountValuePaise > 10_000) {
      throw new BadRequestException("Percentage coupons cannot exceed 100 percent.");
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) {
      throw new BadRequestException("Coupon dates must be valid ISO timestamps.");
    }
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException("Coupon end date must be after its start date.");
    }
    const coupon = await this.coupons.save(this.coupons.create({
      code,
      discountType: dto.discountType,
      discountValuePaise: dto.discountType === "percentage" ? dto.discountValuePaise : dto.discountValuePaise,
      maxRedemptions: dto.maxRedemptions ?? null,
      redeemedCount: 0,
      startsAt,
      endsAt,
      isActive: true,
    }));
    await this.audit.record({
      actorUserId: actor.id,
      action: "payment.coupon_created",
      targetType: "payment_coupon",
      targetId: coupon.id,
      details: { code, discountType: dto.discountType },
    });
    return coupon;
  }

  async listCoupons() {
    return this.coupons.find({ order: { createdAt: "DESC" } });
  }

  async createRefund(dto: CreatePaymentRefundDto, actor: AuthenticatedUser) {
    const requestedReference = dto.paymentReference.trim();
    const refund = await this.dataSource.transaction(async (manager) => {
      const payments = (await manager.query(
        dto.paymentSource === "candidate"
          ? `
            SELECT razorpay_payment_id AS "paymentReference",
                   amount_paise::text AS "amountPaise"
            FROM candidate_premium_orders
            WHERE payment_status = 'paid'
              AND (razorpay_payment_id = $1 OR razorpay_order_id = $1)
            ORDER BY (razorpay_payment_id = $1) DESC
            LIMIT 1
            FOR UPDATE
          `
          : `
            SELECT razorpay_payment_id AS "paymentReference",
                   amount_paise::text AS "amountPaise"
            FROM employer_subscription_payments
            WHERE razorpay_payment_id = $1
            FOR UPDATE
          `,
        [requestedReference],
      )) as Array<{ paymentReference: string | null; amountPaise: string }>;
      const payment = payments[0];
      if (!payment?.paymentReference) {
        throw new BadRequestException(
          "Refunds must reference a captured payment in the selected payment source.",
        );
      }

      const [existingRefunds] = (await manager.query(
        `
        SELECT COALESCE(SUM(amount_paise), 0)::text AS "refundedAmountPaise"
        FROM payment_refunds
        WHERE payment_source = $1
          AND payment_reference = $2
          AND status IN ('pending', 'approved', 'processed')
      `,
        [dto.paymentSource, payment.paymentReference],
      )) as Array<{ refundedAmountPaise: string }>;
      const remainingAmount =
        BigInt(payment.amountPaise) -
        BigInt(existingRefunds.refundedAmountPaise);
      if (BigInt(dto.amountPaise) > remainingAmount) {
        throw new BadRequestException(
          "The refund amount exceeds the remaining captured payment balance.",
        );
      }

      const entity = manager.create(PaymentRefund, {
        paymentSource: dto.paymentSource,
        paymentReference: payment.paymentReference,
        requesterUserId: actor.id,
        amountPaise: dto.amountPaise,
        reason: dto.reason.trim(),
        status: "pending",
      });
      return manager.save(entity);
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: "payment.refund_requested",
      targetType: "payment_refund",
      targetId: refund.id,
      details: {
        paymentSource: dto.paymentSource,
        amountPaise: dto.amountPaise,
      },
    });
    return refund;
  }

  async listRefunds() {
    return this.refunds.find({ order: { createdAt: "DESC" }, take: 500 });
  }

  async reviewRefund(id: number, dto: ReviewPaymentRefundDto, actor: AuthenticatedUser) {
    const refund = await this.refunds.findOneBy({ id });
    if (!refund) throw new NotFoundException("Refund request was not found.");
    if (refund.status !== "pending") throw new BadRequestException("This refund request has already been reviewed.");
    refund.status = dto.status;
    refund.reviewedByUserId = actor.id;
    refund.reviewNote = dto.reviewNote?.trim() || null;
    const saved = await this.refunds.save(refund);
    await this.audit.record({
      actorUserId: actor.id,
      action: dto.status === "approved" ? "payment.refund_approved" : "payment.refund_rejected",
      targetType: "payment_refund",
      targetId: saved.id,
      details: { reviewNote: saved.reviewNote },
    });
    return saved;
  }
}
