import { MigrationInterface, QueryRunner } from "typeorm";

export class AuditRequestId1729000000031 implements MigrationInterface {
  name = "AuditRequestId1729000000031";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit_logs
      ADD COLUMN request_id uuid NULL
    `);
    await queryRunner.query(
      "CREATE INDEX IDX_audit_logs_request_id ON audit_logs (request_id)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX IDX_audit_logs_request_id");
    await queryRunner.query("ALTER TABLE audit_logs DROP COLUMN request_id");
  }
}
