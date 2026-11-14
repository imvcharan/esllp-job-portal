import { MigrationInterface, QueryRunner } from "typeorm";
import { DEFAULT_REPORT_DEFINITIONS } from "../../platform-config/report-definitions";

export class ConfigurableReportDefinitions1729000000045 implements MigrationInterface {
  name = "ConfigurableReportDefinitions1729000000045";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_configuration
      ADD COLUMN report_definitions jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(
      `UPDATE platform_configuration
       SET report_definitions = $1::jsonb`,
      [JSON.stringify(DEFAULT_REPORT_DEFINITIONS)],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE platform_configuration DROP COLUMN report_definitions",
    );
  }
}
