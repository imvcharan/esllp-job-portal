import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../users/user.entity";
import { EmployerOrganization } from "./organization.entity";

export enum OrganizationMemberRole {
  OWNER = "owner",
  ADMIN = "admin",
  RECRUITER = "recruiter",
  HIRING_MANAGER = "hiring_manager",
  BILLING = "billing",
}

@Entity({ name: "employer_organization_members" })
@Unique("UQ_employer_organization_member_email", ["organizationId", "email"])
export class EmployerOrganizationMember {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "organization_id", type: "integer" })
  organizationId!: number;

  @ManyToOne(() => EmployerOrganization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id" })
  organization!: EmployerOrganization;

  @Column({ name: "user_id", type: "integer", nullable: true })
  userId!: number | null;

  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "user_id" })
  user!: User | null;

  @Column({ length: 254 })
  email!: string;

  @Column({ type: "varchar", length: 20 })
  role!: OrganizationMemberRole;

  @Column({ type: "varchar", length: 20, default: "active" })
  status!: "active" | "invited" | "removed";

  @Column({
    name: "invitation_token_hash",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  invitationTokenHash!: string | null;

  @Column({
    name: "invitation_expires_at",
    type: "timestamptz",
    nullable: true,
  })
  invitationExpiresAt!: Date | null;

  @Column({ name: "invited_by_user_id", type: "integer", nullable: true })
  invitedByUserId!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
