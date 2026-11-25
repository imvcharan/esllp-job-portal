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
import { User } from "../users/user.entity";
import { EmployerInterview } from "./employer-interview.entity";
import { EmployerOrganization } from "./organization.entity";

@Entity({ name: "employer_interview_feedback" })
@Unique("UQ_employer_interview_feedback_reviewer", [
  "interviewId",
  "reviewerUserId",
])
export class EmployerInterviewFeedback {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "interview_id", type: "integer" })
  interviewId!: number;

  @ManyToOne(() => EmployerInterview, { onDelete: "CASCADE" })
  @JoinColumn({ name: "interview_id" })
  interview!: EmployerInterview;

  @Column({ name: "organization_id", type: "integer" })
  organizationId!: number;

  @ManyToOne(() => EmployerOrganization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id" })
  organization!: EmployerOrganization;

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
