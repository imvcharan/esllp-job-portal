import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { CandidateApplication } from "./candidate-application.entity";
import { Job } from "../jobs/job.entity";
import { User } from "./user.entity";

@Entity({ name: "candidate_application_documents" })
@Index("IDX_candidate_application_documents_owner_job", [
  "userId",
  "jobId",
  "documentId",
  "createdAt",
])
export class CandidateApplicationDocument {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id", type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ name: "job_id", type: "integer" })
  jobId!: number;

  @ManyToOne(() => Job, { onDelete: "CASCADE" })
  @JoinColumn({ name: "job_id" })
  job!: Job;

  @Column({ name: "application_id", type: "integer", nullable: true })
  applicationId!: number | null;

  @ManyToOne(() => CandidateApplication, {
    onDelete: "CASCADE",
    nullable: true,
  })
  @JoinColumn({ name: "application_id" })
  application!: CandidateApplication | null;

  @Column({ name: "document_id", type: "varchar", length: 40 })
  documentId!: string;

  @Column({ name: "document_label", type: "varchar", length: 120 })
  documentLabel!: string;

  @Column({ name: "file_path", type: "text" })
  filePath!: string;

  @Column({ name: "file_name", type: "varchar", length: 255 })
  fileName!: string;

  @Column({ name: "content_type", type: "varchar", length: 100 })
  contentType!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
