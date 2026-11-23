import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export type PaymentRefundStatus = "pending" | "approved" | "rejected" | "processed" | "failed";

@Entity({ name: "payment_refunds" })
export class PaymentRefund {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: "payment_source", length: 20 }) paymentSource!: "candidate" | "employer";
  @Column({ name: "payment_reference", length: 100 }) paymentReference!: string;
  @Column({ name: "requester_user_id", type: "integer", nullable: true }) requesterUserId!: number | null;
  @Column({ name: "amount_paise", type: "integer" }) amountPaise!: number;
  @Column({ length: 1000 }) reason!: string;
  @Column({ length: 20, default: "pending" }) status!: PaymentRefundStatus;
  @Column({ name: "provider_refund_id", length: 100, nullable: true }) providerRefundId!: string | null;
  @Column({ name: "reviewed_by_user_id", type: "integer", nullable: true }) reviewedByUserId!: number | null;
  @Column({ name: "review_note", length: 1000, nullable: true }) reviewNote!: string | null;
  @Column({ name: "processed_at", type: "timestamptz", nullable: true }) processedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
