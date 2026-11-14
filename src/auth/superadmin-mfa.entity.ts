import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../users/user.entity";

@Entity({ name: "superadmin_mfa" })
export class SuperadminMfa {
  @PrimaryColumn({ name: "user_id", type: "integer" })
  userId!: number;

  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id", referencedColumnName: "id" })
  user!: User;

  @Column({
    name: "secret_encrypted",
    type: "text",
    nullable: true,
    select: false,
  })
  secretEncrypted!: string | null;

  @Column({
    name: "pending_secret_encrypted",
    type: "text",
    nullable: true,
    select: false,
  })
  pendingSecretEncrypted!: string | null;

  @Column({ type: "boolean", default: false })
  enabled!: boolean;

  @Column({ name: "last_totp_step", type: "integer", nullable: true })
  lastTotpStep!: number | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

@Entity({ name: "superadmin_mfa_recovery_codes" })
export class SuperadminMfaRecoveryCode {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id", type: "integer" })
  userId!: number;

  @Column({ name: "code_hash", type: "varchar", length: 64 })
  codeHash!: string;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt!: Date | null;
}
