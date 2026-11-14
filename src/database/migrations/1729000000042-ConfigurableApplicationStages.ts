import { MigrationInterface, QueryRunner } from "typeorm";
import { DEFAULT_APPLICATION_STAGES } from "../../platform-config/default-application-stages";

export class ConfigurableApplicationStages1729000000042
  implements MigrationInterface
{
  name = "ConfigurableApplicationStages1729000000042";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_configuration
      ADD COLUMN application_stages jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(
      `UPDATE platform_configuration
       SET application_stages = $1::jsonb`,
      [JSON.stringify(DEFAULT_APPLICATION_STAGES)],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE platform_configuration DROP COLUMN application_stages",
    );
  }
}
