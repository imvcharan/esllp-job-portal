import { MigrationInterface, QueryRunner } from "typeorm";

export class EmployerCandidateResumeAccess1729000000023
  implements MigrationInterface
{
  name = "EmployerCandidateResumeAccess1729000000023";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE candidate_profiles
        ADD COLUMN allow_recruiter_resume_access boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE TABLE employer_candidate_resume_unlocks (
        id serial PRIMARY KEY,
        organization_id integer NOT NULL
          REFERENCES employer_organizations(id) ON DELETE CASCADE,
        candidate_user_id integer NOT NULL
          REFERENCES users(id) ON DELETE CASCADE,
        unlocked_by_user_id integer NOT NULL
          REFERENCES users(id) ON DELETE CASCADE,
        period_key varchar(7) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT UQ_employer_resume_unlock_period
          UNIQUE (organization_id, candidate_user_id, period_key)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_employer_resume_unlock_usage
        ON employer_candidate_resume_unlocks (organization_id, period_key)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE employer_candidate_resume_unlocks");
    await queryRunner.query(
      "ALTER TABLE candidate_profiles DROP COLUMN allow_recruiter_resume_access",
    );
  }
}
