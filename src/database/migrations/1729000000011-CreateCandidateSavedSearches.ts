import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCandidateSavedSearches1729000000011 implements MigrationInterface {
  name = "CreateCandidateSavedSearches1729000000011";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE candidate_saved_searches (
        id SERIAL PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name varchar(100) NOT NULL,
        query varchar(160) NOT NULL DEFAULT '',
        location varchar(120) NOT NULL DEFAULT '',
        filters jsonb NOT NULL DEFAULT '{}'::jsonb,
        email_alerts boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX IDX_candidate_saved_searches_user_created ON candidate_saved_searches (user_id, created_at DESC)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP INDEX IDX_candidate_saved_searches_user_created",
    );
    await queryRunner.query("DROP TABLE candidate_saved_searches");
  }
}
