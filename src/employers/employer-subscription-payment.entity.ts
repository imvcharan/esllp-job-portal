import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "employer_subscription_payments" })
@Index("IDX_employer_subscription_payments_paid_at", ["paidAt"])
@Index("IDX_employer_subscription_payments_org_paid_at", [
  "organizationId",
  "paidAt",
])
export class EmployerSubscriptionPayment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "organization_id", type: "integer" })
  organizationId!: number;

  @Column({ name: "subscription_id", type: "varchar", length: 100 })
  subscriptionId!: string;

  @Index({ unique: true })
  @Column({ name: "razorpay_payment_id", type: "varchar", length: 100 })
  razorpayPaymentId!: string;

  @Column({ name: "invoice_id", type: "varchar", length: 100, nullable: true })
  invoiceId!: string | null;

  @Column({ name: "plan_key", type: "varchar", length: 20, nullable: true })
  planKey!: string | null;

  @Column({ name: "amount_paise", type: "bigint" })
  amountPaise!: string;

  @Column({ type: "varchar", length: 3 })
  currency!: string;

  @Column({ name: "paid_at", type: "timestamptz" })
  paidAt!: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
