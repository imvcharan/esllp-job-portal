import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { User } from "../users/user.entity";
import { JoinColumn, ManyToOne } from "typeorm";

export type AuthTokenPurpose = "email_verification" | "password_reset";

@Entity({ name: "auth_tokens" })
export class AuthToken {
  @PrimaryColumn({ name: "token_hash", length: 64 })
  tokenHash!: string;

  @Index()
  @Column({ name: "user_id", type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ length: 32 })
  purpose!: AuthTokenPurpose;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
