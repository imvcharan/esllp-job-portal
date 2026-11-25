import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CandidateApplication } from "../users/candidate-application.entity";
import { EmployerOrganization } from "./organization.entity";
import { User } from "../users/user.entity";

@Entity({ name: "employer_interviews" })
@Index(["organizationId", "startsAt"])
@Index(["organizationId", "status", "startsAt"])
@Check(
  "employer_interviews_duration_minutes_check",
  `"duration_minutes" BETWEEN 15 AND 480`,
)
@Check(
  "employer_interviews_status_check",
  `"status" IN ('scheduled', 'cancelled', 'completed')`,
)
export class EmployerInterview {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "organization_id", type: "integer" })
  organizationId!: number;

  @ManyToOne(() => EmployerOrganization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id" })
  organization!: EmployerOrganization;

  @Column({ name: "application_id", type: "integer" })
  applicationId!: number;

  @ManyToOne(() => CandidateApplication, { onDelete: "CASCADE" })
  @JoinColumn({ name: "application_id" })
  application!: CandidateApplication;

  @Column({ name: "scheduled_by_user_id", type: "integer" })
  scheduledByUserId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "scheduled_by_user_id" })
  scheduledBy!: User;

  @Column({ name: "interviewer_user_id", type: "integer", nullable: true })
  interviewerUserId!: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "interviewer_user_id" })
  interviewer!: User | null;

  @Column({ name: "starts_at", type: "timestamptz" })
  startsAt!: Date;

  @Column({ name: "duration_minutes", type: "integer", default: 30 })
  durationMinutes!: number;

  @Column({ type: "varchar", length: 500, nullable: true })
  location!: string | null;

  @Column({
    name: "meeting_url",
    type: "varchar",
    length: 1000,
    nullable: true,
  })
  meetingUrl!: string | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ type: "varchar", length: 20, default: "scheduled" })
  status!: "scheduled" | "cancelled" | "completed";

  @Column({
    name: "candidate_response",
    type: "varchar",
    length: 24,
    default: "pending",
  })
  candidateResponse!: "pending" | "accepted" | "declined" | "reschedule_requested";

  @Column({ name: "candidate_response_note", type: "varchar", length: 500, nullable: true })
  candidateResponseNote!: string | null;

  @Column({ name: "candidate_response_at", type: "timestamptz", nullable: true })
  candidateResponseAt!: Date | null;

  @Column({ name: "calendar_event_id", type: "varchar", length: 255, nullable: true })
  calendarEventId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
