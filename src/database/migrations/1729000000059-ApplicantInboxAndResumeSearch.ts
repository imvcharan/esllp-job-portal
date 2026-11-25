import { MigrationInterface, QueryRunner } from "typeorm";

export class ApplicantInboxAndResumeSearch1729000000059
  implements MigrationInterface
{
  name = "ApplicantInboxAndResumeSearch1729000000059";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employer_saved_candidate_searches
        ADD COLUMN is_shared boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX employer_saved_candidate_searches_shared_name_uq
      ON employer_saved_candidate_searches (organization_id, name)
      WHERE is_shared = true
    `);
    await queryRunner.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await queryRunner.query(`
      CREATE INDEX candidate_display_name_trgm_idx
      ON users USING gin (display_name gin_trgm_ops)
      WHERE role = 'candidate' AND is_active = true
    `);
    await queryRunner.query(`
      CREATE INDEX candidate_profile_headline_trgm_idx
      ON candidate_profiles USING gin (headline gin_trgm_ops)
      WHERE profile_visibility = 'recruiters'
    `);
    await queryRunner.query(`
      CREATE INDEX candidate_profile_location_trgm_idx
      ON candidate_profiles USING gin (location gin_trgm_ops)
      WHERE profile_visibility = 'recruiters'
    `);
    await queryRunner.query(`
      CREATE INDEX candidate_profile_skills_trgm_idx
      ON candidate_profiles USING gin (skills gin_trgm_ops)
      WHERE profile_visibility = 'recruiters'
    `);
    await queryRunner.query(`
      CREATE INDEX candidate_profile_summary_trgm_idx
      ON candidate_profiles USING gin (summary gin_trgm_ops)
      WHERE profile_visibility = 'recruiters'
    `);
    await queryRunner.query(`
      CREATE INDEX candidate_profile_experience_trgm_idx
      ON candidate_profiles USING gin ((experience::text) gin_trgm_ops)
      WHERE profile_visibility = 'recruiters'
    `);
    await queryRunner.query(`
      CREATE INDEX candidate_profile_education_trgm_idx
      ON candidate_profiles USING gin ((education::text) gin_trgm_ops)
      WHERE profile_visibility = 'recruiters'
    `);
    await queryRunner.query(`
      CREATE INDEX candidate_profile_certifications_trgm_idx
      ON candidate_profiles USING gin ((certifications::text) gin_trgm_ops)
      WHERE profile_visibility = 'recruiters'
    `);
    await queryRunner.query(`
      CREATE INDEX candidate_profile_desired_titles_trgm_idx
      ON candidate_profiles USING gin ((desired_job_titles::text) gin_trgm_ops)
      WHERE profile_visibility = 'recruiters'
    `);
    await queryRunner.query(`
      CREATE INDEX candidate_resume_parsed_text_trgm_idx
      ON candidate_resume_versions USING gin (parsed_text gin_trgm_ops)
      WHERE parsed_text <> ''
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP INDEX IF EXISTS candidate_resume_parsed_text_trgm_idx",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS candidate_profile_desired_titles_trgm_idx",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS candidate_profile_certifications_trgm_idx",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS candidate_profile_education_trgm_idx",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS candidate_profile_experience_trgm_idx",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS candidate_profile_summary_trgm_idx",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS candidate_profile_skills_trgm_idx",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS candidate_profile_location_trgm_idx",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS candidate_profile_headline_trgm_idx",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS candidate_display_name_trgm_idx",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS employer_saved_candidate_searches_shared_name_uq",
    );
    await queryRunner.query(`
      ALTER TABLE employer_saved_candidate_searches
        DROP COLUMN is_shared
    `);
  }
}
