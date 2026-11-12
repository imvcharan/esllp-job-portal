import { MigrationInterface, QueryRunner } from "typeorm";

export class EmployerSavedCandidateSearches1729000000022 implements MigrationInterface {
  name = "EmployerSavedCandidateSearches1729000000022";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE employer_saved_candidate_searches (
        id serial PRIMARY KEY,
        organization_id integer NOT NULL
          REFERENCES employer_organizations(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name varchar(100) NOT NULL,
        query varchar(500) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT UQ_employer_saved_searches_name
          UNIQUE (organization_id, user_id, name)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_employer_saved_searches_owner
        ON employer_saved_candidate_searches (organization_id, user_id, created_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE employer_saved_candidate_searches");
  }
}
