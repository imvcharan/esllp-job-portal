import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Job } from "../jobs/job.entity";
import { User } from "./user.entity";

@Entity({ name: "candidate_applications" })
@Index("UQ_candidate_applications_user_job", ["userId", "jobId"], {
  unique: true,
})
export class CandidateApplication {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id" })
  userId!: number;

  @Column({ name: "job_id" })
  jobId!: number;

  @Column({ name: "cover_letter", type: "text", nullable: true })
  coverLetter!: string | null;

  @Column({ length: 20, default: "submitted" })
  status!: string;

  @Column({ name: "resume_path", type: "text", nullable: true })
  resumePath!: string | null;

  @Column({
    name: "resume_file_name",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  resumeFileName!: string | null;

  @Column({ name: "profile_shared", type: "boolean", default: false })
  profileShared!: boolean;

  @Column({ name: "profile_snapshot", type: "jsonb", nullable: true })
  profileSnapshot!: Record<string, unknown> | null;

  @Column({ name: "withdrawn_at", type: "timestamptz", nullable: true })
  withdrawnAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @ManyToOne(() => Job, { onDelete: "CASCADE" })
  @JoinColumn({ name: "job_id" })
  job!: Job;
}
