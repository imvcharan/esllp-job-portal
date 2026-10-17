import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "candidate_profiles" })
export class CandidateProfile {
  @PrimaryColumn({ name: "user_id", type: "int" })
  userId!: number;

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
