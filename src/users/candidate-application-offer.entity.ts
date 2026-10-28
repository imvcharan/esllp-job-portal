import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CandidateApplication } from "./candidate-application.entity";

@Entity({ name: "candidate_application_offers" })
export class CandidateApplicationOffer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "application_id", type: "integer", unique: true })
  applicationId!: number;

  @ManyToOne(() => CandidateApplication, { onDelete: "CASCADE" })
  @JoinColumn({ name: "application_id" })
  application!: CandidateApplication;

  @Column({ name: "terms_summary", type: "text" })
  termsSummary!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status!: "pending" | "accepted" | "declined" | "expired" | "withdrawn";

  @Column({ name: "responded_at", type: "timestamptz", nullable: true })
  respondedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
