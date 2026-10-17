import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity";

export interface CandidateSavedSearchFilters {
  workplaceType?: "remote" | "hybrid" | "onsite";
  employmentType?:
    "full-time" | "part-time" | "contract" | "internship" | "temporary";
  experience?: "early" | "mid" | "senior";
  company?: string;
  minimumSalary?: number;
  freshnessDays?: number;
  sort?: "newest" | "salary" | "title";
}

@Entity({ name: "candidate_saved_searches" })
@Index("IDX_candidate_saved_searches_user_created", ["userId", "createdAt"])
export class CandidateSavedSearch {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id", type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 160, default: "" })
  query!: string;

  @Column({ type: "varchar", length: 120, default: "" })
  location!: string;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  filters!: CandidateSavedSearchFilters;

  @Column({ name: "email_alerts", type: "boolean", default: false })
  emailAlerts!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
