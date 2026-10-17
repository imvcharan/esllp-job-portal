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
import { CandidateApplication } from "../users/candidate-application.entity";
import { EmployerOrganization } from "./organization.entity";
import { User } from "../users/user.entity";

@Entity({ name: "employer_interviews" })
@Index(["organizationId", "startsAt"])
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

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
