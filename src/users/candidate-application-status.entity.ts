import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user.entity";
import { CandidateApplication } from "./candidate-application.entity";

@Entity({ name: "candidate_application_status_history" })
@Index(
  "UQ_candidate_application_history_application_status",
  ["applicationId", "toStatus"],
  { unique: true },
)
export class CandidateApplicationStatus {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "application_id", type: "integer" })
  applicationId!: number;

  @ManyToOne(() => CandidateApplication, { onDelete: "CASCADE" })
  @JoinColumn({ name: "application_id" })
  application!: CandidateApplication;

  @Column({ name: "from_status", type: "varchar", length: 20, nullable: true })
  fromStatus!: string | null;

  @Column({ name: "to_status", type: "varchar", length: 20 })
  toStatus!: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  note!: string | null;

  @Column({ name: "changed_by_user_id", type: "integer", nullable: true })
  changedByUserId!: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "changed_by_user_id" })
  changedBy!: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
