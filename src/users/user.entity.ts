import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum UserRole {
  CANDIDATE = "candidate",
  EMPLOYER = "employer",
  STAFF = "staff",
  ADMIN = "admin",
  SUPERADMIN = "superadmin",
}

export enum EmployerApprovalStatus {
  NOT_APPLICABLE = "not_applicable",
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

@Entity({ name: "users" })
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index("IDX_users_email", { unique: true })
  @Column({ length: 254 })
  email!: string;

  @Column({ name: "password_hash", length: 100, select: false })
  passwordHash!: string;

  @Column({ name: "display_name", length: 120 })
  displayName!: string;

  @Index("UQ_users_username", {
    unique: true,
    where: '"username" IS NOT NULL',
  })
  @Column({ type: "varchar", length: 30, nullable: true })
  username!: string | null;

  @Index("UQ_users_phone_e164", {
    unique: true,
    where: '"phone_e164" IS NOT NULL',
  })
  @Column({ name: "phone_e164", type: "varchar", length: 16, nullable: true })
  phoneE164!: string | null;

  @Column({
    name: "pending_phone_e164",
    type: "varchar",
    length: 16,
    nullable: true,
  })
  pendingPhoneE164!: string | null;

  @Column({ name: "phone_verified", type: "boolean", default: false })
  phoneVerified!: boolean;

  @Column({
    name: "company_name",
    type: "varchar",
    length: 160,
    nullable: true,
  })
  companyName!: string | null;

  @Column({
    name: "company_website",
    type: "varchar",
    length: 500,
    nullable: true,
  })
  companyWebsite!: string | null;

  @Column({ type: "varchar", length: 20, default: UserRole.CANDIDATE })
  role!: UserRole;

  @Column({
    name: "employer_approval_status",
    type: "varchar",
    length: 20,
    default: EmployerApprovalStatus.NOT_APPLICABLE,
  })
  employerApprovalStatus!: EmployerApprovalStatus;

  @Column({ name: "email_verified", type: "boolean", default: false })
  emailVerified!: boolean;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "must_change_password", type: "boolean", default: false })
  mustChangePassword!: boolean;

  @Index("UQ_users_google_subject", {
    unique: true,
    where: '"google_subject" IS NOT NULL',
  })
  @Column({
    name: "google_subject",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  googleSubject!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
