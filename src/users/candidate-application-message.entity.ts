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
import { User } from "./user.entity";

@Entity({ name: "candidate_application_messages" })
@Index(["applicationId", "createdAt"])
export class CandidateApplicationMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "application_id", type: "integer" })
  applicationId!: number;

  @ManyToOne(() => CandidateApplication, { onDelete: "CASCADE" })
  @JoinColumn({ name: "application_id" })
  application!: CandidateApplication;

  @Column({ name: "sender_user_id", type: "integer" })
  senderUserId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sender_user_id" })
  sender!: User;

  @Column({ type: "text" })
  message!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
