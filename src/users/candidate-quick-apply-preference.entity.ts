import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "candidate_quick_apply_preferences" })
@Index("UQ_candidate_quick_apply_preferences_user_job", ["userId", "jobId"], {
  unique: true,
})
export class CandidateQuickApplyPreference {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id", type: "integer" })
  userId!: number;

  @Column({ name: "job_id", type: "integer" })
  jobId!: number;

  @Column({ name: "include_resume", type: "boolean", default: false })
  includeResume!: boolean;

  @Column({ name: "share_profile", type: "boolean", default: false })
  shareProfile!: boolean;

  @Column({ name: "consented_at", type: "timestamptz" })
  consentedAt!: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
