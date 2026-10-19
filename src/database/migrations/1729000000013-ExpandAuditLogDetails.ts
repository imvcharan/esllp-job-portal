import { MigrationInterface, QueryRunner } from "typeorm";

export class ExpandAuditLogDetails1729000000013 implements MigrationInterface {
  name = "ExpandAuditLogDetails1729000000013";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit_logs
        ADD COLUMN location_city varchar(120) NULL,
        ADD COLUMN location_region varchar(120) NULL,
        ADD COLUMN location_country varchar(120) NULL,
        ADD COLUMN user_agent varchar(1000) NULL
    `);
    await queryRunner.query(
      "CREATE INDEX IDX_audit_logs_created_at ON audit_logs (created_at DESC, id DESC)",
    );
    await queryRunner.query(
      "CREATE INDEX IDX_audit_logs_action ON audit_logs (action)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX IDX_audit_logs_action");
    await queryRunner.query("DROP INDEX IDX_audit_logs_created_at");
    await queryRunner.query(`
      ALTER TABLE audit_logs
        DROP COLUMN user_agent,
        DROP COLUMN location_country,
        DROP COLUMN location_region,
        DROP COLUMN location_city
    `);
  }
}
