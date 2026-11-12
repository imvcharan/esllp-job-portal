import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { CandidateApplication } from "../users/candidate-application.entity";
import { User } from "../users/user.entity";

@Entity({ name: "employer_application_scorecards" })
@Unique("UQ_employer_application_scorecard_reviewer", [
  "organizationId",
  "applicationId",
  "reviewerUserId",
])
export class EmployerApplicationScorecard {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "organization_id", type: "integer" })
  organizationId!: number;

  @Column({ name: "application_id", type: "integer" })
  applicationId!: number;

  @ManyToOne(() => CandidateApplication, { onDelete: "CASCADE" })
  @JoinColumn({ name: "application_id" })
  application!: CandidateApplication;

  @Column({ name: "reviewer_user_id", type: "integer" })
  reviewerUserId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "reviewer_user_id" })
  reviewer!: User;

  @Column({ type: "jsonb" })
  scores!: Record<string, number>;

  @Column({ type: "varchar", length: 20 })
  recommendation!: "strong_yes" | "yes" | "maybe" | "no";

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
