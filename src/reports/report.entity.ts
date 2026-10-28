import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from "typeorm";

export enum ReportTargetType {
  JOB = "job",
  COMPANY = "company",
  USER = "user",
}

export enum ReportStatus {
  OPEN = "open",
  REVIEWING = "reviewing",
  ACTIONED = "actioned",
  DISMISSED = "dismissed",
}

@Entity({ name: "reports" })
@Index("IDX_reports_status_created", ["status", "createdAt"])
@Index("IDX_reports_target", ["targetType", "targetId"])
export class Report {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "target_type", type: "varchar", length: 20 })
  targetType!: ReportTargetType;

  @Column({ name: "target_id", type: "integer" })
  targetId!: number;

  @Column({ length: 40 })
  reason!: string;

  @Column({ type: "text", nullable: true })
  details!: string | null;

  @Column({
    type: "varchar",
    length: 20,
    default: ReportStatus.OPEN,
  })
  status!: ReportStatus;

  @Column({
    name: "resolution_note",
    type: "varchar",
    length: 1000,
    nullable: true,
  })
  resolutionNote!: string | null;

  @Column({ name: "reporter_user_id", type: "integer", nullable: true })
  reporterUserId!: number | null;

  @Column({ name: "resolved_by_user_id", type: "integer", nullable: true })
  resolvedByUserId!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
