import { MigrationInterface, QueryRunner } from "typeorm";

export class SearchIndexOutboxClaims1729000000055 implements MigrationInterface {
  name = "SearchIndexOutboxClaims1729000000055";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE search_index_outbox
      ADD COLUMN claim_token uuid NULL,
      ADD COLUMN claimed_until timestamptz NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_search_index_outbox_claimed
      ON search_index_outbox (claimed_until, next_attempt_at, id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX IDX_search_index_outbox_claimed");
    await queryRunner.query(`
      ALTER TABLE search_index_outbox
      DROP COLUMN claimed_until,
      DROP COLUMN claim_token
    `);
  }
}
