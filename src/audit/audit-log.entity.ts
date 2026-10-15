import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'actor_user_id', type: 'integer', nullable: true })
  actorUserId!: number | null;

  @Column({ length: 80 })
  action!: string;

  @Column({ name: 'target_type', length: 50 })
  targetType!: string;

  @Column({ name: 'target_id', length: 80 })
  targetId!: string;

  @Column({ type: 'text', nullable: true })
  details!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
