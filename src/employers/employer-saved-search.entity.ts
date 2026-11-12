import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm";
import { EmployerOrganization } from "./organization.entity";
import { User } from "../users/user.entity";

@Entity({ name: "employer_saved_candidate_searches" })
@Index("IDX_employer_saved_searches_owner", [
  "organizationId",
  "userId",
  "createdAt",
])
@Index(
  "UQ_employer_saved_searches_name",
  ["organizationId", "userId", "name"],
  { unique: true },
)
export class EmployerSavedSearch {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "organization_id", type: "integer" })
  organizationId!: number;

  @ManyToOne(() => EmployerOrganization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id" })
  organization!: EmployerOrganization;

  @Column({ name: "user_id", type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 500 })
  query!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
