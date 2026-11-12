import { MigrationInterface, QueryRunner } from "typeorm";

export class EmailNotificationRetention1729000000029 implements MigrationInterface {
  name = "EmailNotificationRetention1729000000029";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE email_notification_outbox
      ADD COLUMN failed_at timestamptz NULL
    `);
    await queryRunner.query(`
      UPDATE email_notification_outbox
      SET failed_at = created_at
      WHERE status = 'failed'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE email_notification_outbox DROP COLUMN failed_at",
    );
  }
}
