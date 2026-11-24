import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "payment_coupons" })
@Check(
  "payment_coupons_discount_type_check",
  `"discount_type" IN ('percentage', 'fixed')`,
)
@Check(
  "payment_coupons_discount_value_paise_check",
  `"discount_value_paise" > 0`,
)
@Check(
  "payment_coupons_max_redemptions_check",
  `"max_redemptions" IS NULL OR "max_redemptions" > 0`,
)
@Check("payment_coupons_redeemed_count_check", `"redeemed_count" >= 0`)
export class PaymentCoupon {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ length: 40, unique: true }) code!: string;
  @Column({ name: "discount_type", length: 20 }) discountType!: "percentage" | "fixed";
  @Column({ name: "discount_value_paise", type: "integer" }) discountValuePaise!: number;
  @Column({ name: "max_redemptions", type: "integer", nullable: true }) maxRedemptions!: number | null;
  @Column({ name: "redeemed_count", type: "integer", default: 0 }) redeemedCount!: number;
  @Column({ name: "starts_at", type: "timestamptz", nullable: true }) startsAt!: Date | null;
  @Column({ name: "ends_at", type: "timestamptz", nullable: true }) endsAt!: Date | null;
  @Column({ name: "is_active", type: "boolean", default: true }) isActive!: boolean;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
