import { MigrationInterface, QueryRunner } from "typeorm";

export class SearchIndexOutbox1729000000053 implements MigrationInterface {
  name = "SearchIndexOutbox1729000000053";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE search_index_outbox (
        id bigserial PRIMARY KEY,
        entity_type varchar(20) NOT NULL CHECK (entity_type IN ('job', 'candidate')),
        entity_id integer NOT NULL,
        operation varchar(10) NOT NULL CHECK (operation IN ('upsert', 'delete')),
        attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        last_error varchar(1000) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (entity_type, entity_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_search_index_outbox_due
      ON search_index_outbox (next_attempt_at, id)
    `);
    await queryRunner.query(`
      CREATE TABLE search_index_backfills (
        index_name varchar(128) NOT NULL,
        entity_type varchar(20) NOT NULL CHECK (entity_type IN ('job', 'candidate')),
        completed_at timestamptz NULL,
        PRIMARY KEY (index_name, entity_type)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE search_index_backfills");
    await queryRunner.query("DROP TABLE search_index_outbox");
  }
}
