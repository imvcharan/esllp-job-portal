import { MigrationInterface, QueryRunner } from "typeorm";

export class PlatformConfiguration1729000000038 implements MigrationInterface {
  name = "PlatformConfiguration1729000000038";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE platform_configuration (
        id smallint PRIMARY KEY CHECK (id = 1),
        candidate_registration_enabled boolean NOT NULL DEFAULT true,
        employer_registration_enabled boolean NOT NULL DEFAULT true,
        employer_approval_required boolean NOT NULL DEFAULT true,
        job_approval_required boolean NOT NULL DEFAULT true,
        customized boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      INSERT INTO platform_configuration (id)
      VALUES (1)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE platform_configuration");
  }
}
