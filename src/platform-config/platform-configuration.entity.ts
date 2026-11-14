import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { ConfigurableReportDefinition } from "./report-definitions";

@Entity({ name: "platform_configuration" })
export class PlatformConfiguration {
  @PrimaryColumn({ type: "smallint" })
  id!: number;

  @Column({
    name: "candidate_registration_enabled",
    type: "boolean",
    default: true,
  })
  candidateRegistrationEnabled!: boolean;

  @Column({
    name: "employer_registration_enabled",
    type: "boolean",
    default: true,
  })
  employerRegistrationEnabled!: boolean;

  @Column({
    name: "employer_approval_required",
    type: "boolean",
    default: true,
  })
  employerApprovalRequired!: boolean;

  @Column({ name: "job_approval_required", type: "boolean", default: true })
  jobApprovalRequired!: boolean;

  @Column({
    name: "job_categories",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  jobCategories!: string[];

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  industries!: string[];

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  locations!: string[];

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

  @Column({
    name: "application_stages",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  applicationStages!: Array<{
    key: string;
    label: string;
    transitions: string[];
  }>;

  @Column({
    name: "report_definitions",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  reportDefinitions!: ConfigurableReportDefinition[];

  @Column({ type: "boolean", default: false })
  customized!: boolean;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
