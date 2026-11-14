import { MigrationInterface, QueryRunner } from "typeorm";

export class ApplicationSourceAttribution1729000000043 implements MigrationInterface {
  name = "ApplicationSourceAttribution1729000000043";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE candidate_applications
      ADD COLUMN source_attribution jsonb NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE candidate_applications DROP COLUMN source_attribution",
    );
  }
}
