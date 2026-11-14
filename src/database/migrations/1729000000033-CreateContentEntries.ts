import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateContentEntries1729000000033 implements MigrationInterface {
  name = "CreateContentEntries1729000000033";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE content_entries_type_enum AS ENUM ('page', 'faq', 'blog', 'banner')
    `);
    await queryRunner.query(`
      CREATE TABLE content_entries (
        id SERIAL PRIMARY KEY,
        type content_entries_type_enum NOT NULL,
        slug varchar(120) NOT NULL,
        title varchar(200) NOT NULL,
        summary text NULL,
        body text NOT NULL,
        seo_title varchar(200) NULL,
        seo_description varchar(300) NULL,
        is_published boolean NOT NULL DEFAULT false,
        published_at timestamp NULL,
        created_by_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_by_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_content_entries_slug" ON content_entries (slug)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_content_entries_type_published"
      ON content_entries (type, is_published)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_content_entries_type_published"');
    await queryRunner.query("DROP TABLE content_entries");
    await queryRunner.query("DROP TYPE content_entries_type_enum");
  }
}
