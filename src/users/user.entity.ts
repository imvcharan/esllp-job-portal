import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  CANDIDATE = 'candidate',
  EMPLOYER = 'employer',
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin',
}

export enum EmployerApprovalStatus {
  NOT_APPLICABLE = 'not_applicable',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ length: 254 })
  email!: string;

  @Column({ name: 'password_hash', length: 100, select: false })
  passwordHash!: string;

  @Column({ name: 'display_name', length: 120 })
  displayName!: string;

  @Column({ name: 'company_name', type: 'varchar', length: 160, nullable: true })
  companyName!: string | null;

  @Column({ name: 'company_website', type: 'varchar', length: 500, nullable: true })
  companyWebsite!: string | null;

  @Column({ type: 'varchar', length: 20, default: UserRole.CANDIDATE })
  role!: UserRole;

  @Column({
    name: 'employer_approval_status',
    type: 'varchar',
    length: 20,
    default: EmployerApprovalStatus.NOT_APPLICABLE,
  })
  employerApprovalStatus!: EmployerApprovalStatus;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
