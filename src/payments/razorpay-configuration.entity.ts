import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "razorpay_configuration" })
export class RazorpayConfiguration {
  @PrimaryColumn({ type: "smallint" })
  id!: number;

  @Column({ name: "key_id", type: "varchar", length: 255, nullable: true })
  keyId!: string | null;

  @Column({ type: "boolean", default: false })
  enabled!: boolean;

  @Column({
    name: "api_secret_encrypted",
    type: "text",
    nullable: true,
    select: false,
  })
  apiSecretEncrypted!: string | null;

  @Column({
    name: "webhook_secret_encrypted",
    type: "text",
    nullable: true,
    select: false,
  })
  webhookSecretEncrypted!: string | null;

  @Column({
    name: "starter_plan_id",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  starterPlanId!: string | null;

  @Column({ name: "starter_amount_paise", type: "integer", nullable: true })
  starterAmountPaise!: number | null;

  @Column({
    name: "growth_plan_id",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  growthPlanId!: string | null;

  @Column({ name: "growth_amount_paise", type: "integer", nullable: true })
  growthAmountPaise!: number | null;

  @Column({
    name: "business_plan_id",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  businessPlanId!: string | null;

  @Column({ name: "business_amount_paise", type: "integer", nullable: true })
  businessAmountPaise!: number | null;

  @Column({
    name: "enterprise_plan_id",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  enterprisePlanId!: string | null;

  @Column({ name: "enterprise_amount_paise", type: "integer", nullable: true })
  enterpriseAmountPaise!: number | null;

  @Column({ name: "starter_active_jobs", type: "integer", default: 5 })
  starterActiveJobs!: number;

  @Column({ name: "starter_seats", type: "integer", default: 3 })
  starterSeats!: number;

  @Column({ name: "starter_resume_credits", type: "integer", default: 0 })
  starterResumeCredits!: number;

  @Column({ name: "growth_active_jobs", type: "integer", default: 25 })
  growthActiveJobs!: number;

  @Column({ name: "growth_seats", type: "integer", default: 10 })
  growthSeats!: number;

  @Column({ name: "growth_resume_credits", type: "integer", default: 25 })
  growthResumeCredits!: number;

  @Column({ name: "business_active_jobs", type: "integer", default: 75 })
  businessActiveJobs!: number;

  @Column({ name: "business_seats", type: "integer", default: 25 })
  businessSeats!: number;

  @Column({ name: "business_resume_credits", type: "integer", default: 100 })
  businessResumeCredits!: number;

  @Column({ name: "enterprise_active_jobs", type: "integer", default: 1000 })
  enterpriseActiveJobs!: number;

  @Column({ name: "enterprise_seats", type: "integer", default: 100 })
  enterpriseSeats!: number;

  @Column({ name: "enterprise_resume_credits", type: "integer", default: 500 })
  enterpriseResumeCredits!: number;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
