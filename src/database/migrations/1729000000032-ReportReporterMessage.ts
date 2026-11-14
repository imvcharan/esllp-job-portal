import { MigrationInterface, QueryRunner } from "typeorm";

export class ReportReporterMessage1729000000032 implements MigrationInterface {
  name = "ReportReporterMessage1729000000032";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE reports
      ADD COLUMN reporter_message varchar(1000) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE reports DROP COLUMN reporter_message");
  }
}
