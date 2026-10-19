import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "jobs" })
export class Job {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 160 })
  title!: string;

  @Column({ length: 120 })
  company!: string;

  @Column({ length: 120 })
  location!: string;

  @Column({ name: "workplace_type", length: 20, default: "onsite" })
  workplaceType!: string;

  @Column({ name: "employment_type", length: 30, default: "full-time" })
  employmentType!: string;

  @Column({ name: "salary_min", type: "integer", nullable: true })
  salaryMin!: number | null;

  @Column({ name: "salary_max", type: "integer", nullable: true })
  salaryMax!: number | null;

  @Column({ name: "salary_currency", length: 3, default: "INR" })
  salaryCurrency!: string;

  @Column({ name: "salary_period", length: 10, default: "year" })
  salaryPeriod!: string;

  @Column({ name: "application_deadline", type: "date", nullable: true })
  applicationDeadline!: string | null;

  @Column({ name: "number_of_openings", type: "integer", default: 1 })
  numberOfOpenings!: number;

  @Column({ type: "varchar", length: 80, nullable: true })
  experience!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "employer_user_id", type: "integer", nullable: true })
  employerUserId!: number | null;

  @Column({ name: "organization_id", type: "integer", nullable: true })
  organizationId!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
