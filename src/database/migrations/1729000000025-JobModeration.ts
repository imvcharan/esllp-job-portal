import { MigrationInterface, QueryRunner } from "typeorm";

export class JobModeration1729000000025 implements MigrationInterface {
  name = "JobModeration1729000000025";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE jobs
        ADD COLUMN moderation_status varchar(20) NOT NULL DEFAULT 'draft',
        ADD COLUMN moderation_note text NULL
    `);
    await queryRunner.query(`
      UPDATE jobs
      SET moderation_status = CASE WHEN is_active THEN 'approved' ELSE 'draft' END
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE jobs
        DROP COLUMN moderation_note,
        DROP COLUMN moderation_status
    `);
  }
}
