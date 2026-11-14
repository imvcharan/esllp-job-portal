import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateContentEntryRevisions1729000000035
  implements MigrationInterface
{
  name = "CreateContentEntryRevisions1729000000035";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE content_entry_revisions (
        id SERIAL PRIMARY KEY,
        content_entry_id integer NOT NULL
          REFERENCES content_entries(id) ON DELETE CASCADE,
        version integer NOT NULL,
        type content_entries_type_enum NOT NULL,
        slug varchar(120) NOT NULL,
        title varchar(200) NOT NULL,
        summary text NULL,
        body text NOT NULL,
        seo_title varchar(200) NULL,
        seo_description varchar(300) NULL,
        is_published boolean NOT NULL,
        published_at timestamp NULL,
        created_by_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_content_entry_revisions_version"
          UNIQUE (content_entry_id, version)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_content_entry_revisions_history"
      ON content_entry_revisions (content_entry_id, version DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_content_entry_revisions_history"');
    await queryRunner.query("DROP TABLE content_entry_revisions");
  }
}
