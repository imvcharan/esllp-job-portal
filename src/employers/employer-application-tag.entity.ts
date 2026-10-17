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

@Entity({ name: "employer_application_tags" })
@Index(
  "UQ_employer_application_tag",
  ["organizationId", "applicationId", "label"],
  {
    unique: true,
  },
)
export class EmployerApplicationTag {
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

  @Column({ length: 40 })
  label!: string;

  @Column({ name: "created_by_user_id", type: "integer" })
  createdByUserId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "created_by_user_id" })
  createdBy!: User;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
