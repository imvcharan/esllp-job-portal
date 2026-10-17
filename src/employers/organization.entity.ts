import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "employer_organizations" })
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

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
