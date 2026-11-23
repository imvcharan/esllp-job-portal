import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "payment_coupons" })
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
