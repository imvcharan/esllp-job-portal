import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'jobs' })
export class Job {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 160 })
  title!: string;

  @Column({ length: 120 })
  company!: string;

  @Column({ length: 120 })
  location!: string;

  @Column({ name: 'workplace_type', length: 20, default: 'onsite' })
  workplaceType!: string;

  @Column({ name: 'employment_type', length: 30, default: 'full-time' })
  employmentType!: string;

  @Column({ name: 'salary_min', type: 'integer', nullable: true })
  salaryMin!: number | null;

  @Column({ name: 'salary_max', type: 'integer', nullable: true })
  salaryMax!: number | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  experience!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
