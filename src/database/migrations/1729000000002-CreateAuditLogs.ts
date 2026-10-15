import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1729000000002 implements MigrationInterface {
  name = 'CreateAuditLogs1729000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "actor_user_id" integer,
        "action" varchar(80) NOT NULL,
        "target_type" varchar(50) NOT NULL,
        "target_id" varchar(80) NOT NULL,
        "details" text,
        "ip_address" varchar(64),
        "created_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_audit_logs_actor_user_id" ON "audit_logs" ("actor_user_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_audit_logs_actor_user_id"');
    await queryRunner.query('DROP TABLE "audit_logs"');
  }
}
