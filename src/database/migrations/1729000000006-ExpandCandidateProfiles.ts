import { MigrationInterface, QueryRunner } from "typeorm";

export class ExpandCandidateProfiles1729000000006 implements MigrationInterface {
  name = "ExpandCandidateProfiles1729000000006";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE candidate_profiles
        ADD COLUMN desired_job_titles jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN employment_types jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN workplace_types jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN experience jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN education jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN links jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN photo_path text NULL,
        ADD COLUMN resume_path text NULL,
        ADD COLUMN resume_file_name varchar(255) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE candidate_profiles
        DROP COLUMN desired_job_titles,
        DROP COLUMN employment_types,
        DROP COLUMN workplace_types,
        DROP COLUMN experience,
        DROP COLUMN education,
        DROP COLUMN links,
        DROP COLUMN photo_path,
        DROP COLUMN resume_path,
        DROP COLUMN resume_file_name
    `);
  }
}
