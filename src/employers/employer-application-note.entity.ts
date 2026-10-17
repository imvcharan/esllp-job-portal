import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm";
import { CandidateApplication } from "../users/candidate-application.entity";
import { EmployerOrganization } from "./organization.entity";
import { User } from "../users/user.entity";

@Entity({ name: "employer_application_notes" })
@Index(["organizationId", "applicationId", "createdAt"])
export class EmployerApplicationNote {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "organization_id", type: "integer" })
  organizationId!: number;

  @ManyToOne(() => EmployerOrganization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id" })
  organization!: EmployerOrganization;

  @Column({ name: "application_id", type: "integer" })
  applicationId!: number;

  @ManyToOne(() => CandidateApplication, { onDelete: "CASCADE" })
  @JoinColumn({ name: "application_id" })
  application!: CandidateApplication;

  @Column({ name: "author_user_id", type: "integer" })
  authorUserId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "author_user_id" })
  author!: User;

  @Column({ type: "text" })
  note!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
