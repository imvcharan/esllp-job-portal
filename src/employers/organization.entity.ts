import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "employer_organizations" })
@Check(
  "CHK_employer_organizations_plan_key",
  `"plan_key" IN ('free', 'starter', 'growth', 'business', 'enterprise')`,
)
@Check(
  "CHK_employer_organizations_pending_plan_key",
  `"pending_plan_key" IS NULL OR "pending_plan_key" IN ('starter', 'growth', 'business', 'enterprise')`,
)
export class EmployerOrganization {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 160 })
  name!: string;

  @Index({ unique: true })
  @Column({ length: 180 })
  slug!: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  website!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  industry!: string | null;

  @Column({ name: "company_size", type: "varchar", length: 40, nullable: true })
  companySize!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({
    name: "billing_legal_name",
    type: "varchar",
    length: 180,
    nullable: true,
  })
  billingLegalName!: string | null;

  @Column({
    name: "billing_email",
    type: "varchar",
    length: 254,
    nullable: true,
  })
  billingEmail!: string | null;

  @Column({
    name: "billing_tax_id",
    type: "varchar",
    length: 30,
    nullable: true,
  })
  billingTaxId!: string | null;

  @Column({ name: "billing_address", type: "text", nullable: true })
  billingAddress!: string | null;

  @Column({ name: "logo_url", type: "varchar", length: 1000, nullable: true })
  logoUrl!: string | null;

  @Column({
    name: "verification_status",
    type: "varchar",
    length: 20,
    default: "unsubmitted",
  })
  verificationStatus!: "unsubmitted" | "pending" | "verified" | "rejected";

  @Column({ name: "verification_details", type: "text", nullable: true })
  verificationDetails!: string | null;

  @Column({ name: "verification_note", type: "text", nullable: true })
  verificationNote!: string | null;

  @Column({
    name: "verification_requested_at",
    type: "timestamptz",
    nullable: true,
  })
  verificationRequestedAt!: Date | null;

  @Column({ name: "verified_at", type: "timestamptz", nullable: true })
  verifiedAt!: Date | null;

  @Column({ name: "plan_key", type: "varchar", length: 20, default: "free" })
  planKey!: string;

  @Column({
    name: "subscription_status",
    type: "varchar",
    length: 20,
    default: "free",
  })
  subscriptionStatus!: string;

  @Column({
    name: "razorpay_subscription_id",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  razorpaySubscriptionId!: string | null;

  @Column({
    name: "pending_razorpay_subscription_id",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  pendingRazorpaySubscriptionId!: string | null;

  @Column({
    name: "pending_plan_key",
    type: "varchar",
    length: 20,
    nullable: true,
  })
  pendingPlanKey!: string | null;

  @Column({
    name: "subscription_current_period_end",
    type: "timestamptz",
    nullable: true,
  })
  subscriptionCurrentPeriodEnd!: Date | null;

  @Column({ name: "subscription_plan_snapshot", type: "jsonb", nullable: true })
  subscriptionPlanSnapshot!: {
    activeJobs: number;
    seats: number;
    resumeCredits: number;
    amountInr: number;
    currency: string;
    razorpayPlanId: string;
  } | null;

  @Column({ name: "past_due_started_at", type: "timestamptz", nullable: true })
  pastDueStartedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
