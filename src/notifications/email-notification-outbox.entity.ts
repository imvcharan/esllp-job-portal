import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "email_notification_outbox" })
@Index("IDX_email_notification_outbox_due", ["status", "nextAttemptAt", "id"])
export class EmailNotificationOutbox {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    name: "deduplication_key",
    type: "varchar",
    length: 200,
    unique: true,
  })
  deduplicationKey!: string;

  @Column({
    name: "recipient_email",
    type: "varchar",
    length: 254,
    nullable: true,
  })
  recipientEmail!: string | null;

  @Column({ type: "varchar", length: 300, nullable: true })
  subject!: string | null;

  @Column({ type: "text", nullable: true })
  message!: string | null;

  @Column({ type: "varchar", length: 20, default: "queued" })
  status!: "queued" | "sending" | "retrying" | "sent" | "failed";

  @Column({ type: "integer", default: 0 })
  attempts!: number;

  @Column({
    name: "next_attempt_at",
    type: "timestamptz",
    default: () => "now()",
  })
  nextAttemptAt!: Date;

  @Column({ name: "locked_at", type: "timestamptz", nullable: true })
  lockedAt!: Date | null;

  @Column({ name: "last_error", type: "varchar", length: 1000, nullable: true })
  lastError!: string | null;

  @Column({ name: "failed_at", type: "timestamptz", nullable: true })
  failedAt!: Date | null;

  @Column({ name: "sent_at", type: "timestamptz", nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
