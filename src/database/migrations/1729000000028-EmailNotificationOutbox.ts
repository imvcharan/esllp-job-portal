import { MigrationInterface, QueryRunner } from "typeorm";

export class EmailNotificationOutbox1729000000028
  implements MigrationInterface
{
  name = "EmailNotificationOutbox1729000000028";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE email_notification_outbox (
        id BIGSERIAL PRIMARY KEY,
        deduplication_key varchar(200) NOT NULL UNIQUE,
        recipient_email varchar(254) NULL,
        subject varchar(300) NULL,
        message text NULL,
        status varchar(20) NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'sending', 'retrying', 'sent', 'failed')),
        attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        locked_at timestamptz NULL,
        last_error varchar(1000) NULL,
        sent_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (
          status IN ('sent', 'failed')
          OR (recipient_email IS NOT NULL AND subject IS NOT NULL AND message IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_email_notification_outbox_due
      ON email_notification_outbox (status, next_attempt_at, id)
      WHERE status IN ('queued', 'retrying')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE email_notification_outbox");
  }
}
