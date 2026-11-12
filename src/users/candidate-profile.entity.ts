import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity";

@Entity({ name: "candidate_profiles" })
export class CandidateProfile {
  @PrimaryColumn({ name: "user_id", type: "int" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ length: 160, default: "" })
  headline!: string;

  @Column({ length: 120, default: "" })
  location!: string;

  @Column({ length: 32, default: "" })
  phone!: string;

  @Column({ type: "text" })
  summary!: string;

  @Column({ type: "text" })
  skills!: string;

  @Column({
    name: "desired_job_titles",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  desiredJobTitles!: string[];

  @Column({
    name: "employment_types",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  employmentTypes!: string[];

  @Column({
    name: "workplace_types",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  workplaceTypes!: string[];

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  experience!: CandidateExperience[];

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  education!: CandidateEducation[];

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  certifications!: CandidateCertification[];

  @Column({
    name: "salary_preferences",
    type: "jsonb",
    default: () => "'{}'::jsonb",
  })
  salaryPreferences!: CandidateSalaryPreferences;

  @Column({
    name: "profile_visibility",
    type: "varchar",
    length: 20,
    default: "private",
  })
  profileVisibility!: "private" | "applications" | "recruiters";

  @Column({ name: "public_profile_enabled", type: "boolean", default: false })
  publicProfileEnabled!: boolean;

  @Column({ name: "allow_recruiter_contact", type: "boolean", default: false })
  allowRecruiterContact!: boolean;

  @Column({
    name: "allow_recruiter_resume_access",
    type: "boolean",
    default: false,
  })
  allowRecruiterResumeAccess!: boolean;

  @Column({
    name: "premium_boost_until",
    type: "timestamptz",
    nullable: true,
  })
  premiumBoostUntil!: Date | null;

  @Column({
    name: "resume_builder",
    type: "jsonb",
    default: () => "'{}'::jsonb",
  })
  resumeBuilder!: CandidateResumeBuilder;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  links!: CandidateLinks;

  @Column({ name: "photo_path", type: "text", nullable: true })
  photoPath!: string | null;

  @Column({ name: "resume_path", type: "text", nullable: true })
  resumePath!: string | null;

  @Column({
    name: "resume_file_name",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  resumeFileName!: string | null;

  @Column({
    name: "share_profile_on_application",
    type: "boolean",
    default: false,
  })
  shareProfileOnApplication!: boolean;

  @Column({
    name: "application_email_updates",
    type: "boolean",
    default: true,
  })
  applicationEmailUpdates!: boolean;

  @Column({ name: "job_alert_emails", type: "boolean", default: false })
  jobAlertEmails!: boolean;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

export interface CandidateExperience {
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface CandidateEducation {
  institution: string;
  qualification: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface CandidateLinks {
  linkedin: string;
  portfolio: string;
  github: string;
}

export interface CandidateCertification {
  name: string;
  issuer: string;
  issueDate: string;
  credentialUrl: string;
}

export interface CandidateSalaryPreferences {
  minimum?: number;
  currency?: string;
  period?: "year" | "month" | "hour";
}

export interface CandidateResumeBuilder {
  title?: string;
  summary?: string;
  sectionOrder?: string[];
}
