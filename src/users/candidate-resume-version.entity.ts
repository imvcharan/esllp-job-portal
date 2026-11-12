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

@Entity({ name: "candidate_resume_versions" })
@Index("IDX_candidate_resume_versions_user_created", ["userId", "createdAt"])
export class CandidateResumeVersion {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id", type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ name: "storage_path", type: "text", unique: true })
  storagePath!: string;

  @Column({ name: "file_name", length: 255 })
  fileName!: string;

  @Column({ name: "mime_type", length: 100 })
  mimeType!: string;

  @Column({ name: "parsed_text", type: "text", default: "" })
  parsedText!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
