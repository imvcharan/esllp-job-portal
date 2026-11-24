import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "featured_job_placements" })
@Check(
  "featured_job_placements_placement_type_check",
  `"placement_type" IN ('homepage', 'search', 'email')`,
)
@Check("featured_job_placements_ends_at_check", `"ends_at" > "starts_at"`)
@Check(
  "featured_job_placements_status_check",
  `"status" IN ('scheduled', 'active', 'expired', 'cancelled')`,
)
export class FeaturedJobPlacement {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: "job_id", type: "integer" }) jobId!: number;
  @Column({ name: "organization_id", type: "integer" }) organizationId!: number;
  @Column({ name: "placement_type", length: 20 }) placementType!: "homepage" | "search" | "email";
  @Column({ name: "starts_at", type: "timestamptz" }) startsAt!: Date;
  @Column({ name: "ends_at", type: "timestamptz" }) endsAt!: Date;
  @Column({ length: 20, default: "scheduled" }) status!: "scheduled" | "active" | "expired" | "cancelled";
  @Column({ name: "payment_reference", length: 100, nullable: true }) paymentReference!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
