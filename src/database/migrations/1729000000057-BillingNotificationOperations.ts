import { MigrationInterface, QueryRunner } from "typeorm";

export class BillingNotificationOperations1729000000057 implements MigrationInterface {
  name = "BillingNotificationOperations1729000000057";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE razorpay_configuration
      ADD COLUMN past_due_grace_days integer NOT NULL DEFAULT 7
        CHECK (past_due_grace_days BETWEEN 0 AND 30)
    `);
    await queryRunner.query(`
      ALTER TABLE employer_organizations
      ADD COLUMN subscription_plan_snapshot jsonb NULL,
      ADD COLUMN past_due_started_at timestamptz NULL
    `);
    await queryRunner.query(`
      UPDATE employer_organizations
      SET past_due_started_at = updated_at
      WHERE subscription_status = 'past_due'
    `);
    await queryRunner.query(`
      ALTER TABLE candidate_premium_orders
      DROP CONSTRAINT FK_candidate_premium_orders_user,
      DROP CONSTRAINT candidate_premium_orders_payment_status_check,
      ADD COLUMN invoice_id varchar(100) NULL,
      ADD CONSTRAINT candidate_premium_orders_payment_status_check
        CHECK (payment_status IN ('pending', 'paid', 'partially_refunded', 'refunded')),
      ALTER COLUMN user_id DROP NOT NULL,
      ADD CONSTRAINT FK_candidate_premium_orders_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE TABLE employer_resume_credit_events (
        id bigserial PRIMARY KEY,
        source_unlock_id integer NOT NULL UNIQUE,
        organization_id integer NULL
          REFERENCES employer_organizations(id) ON DELETE SET NULL,
        candidate_user_id integer NULL
          REFERENCES users(id) ON DELETE SET NULL,
        actor_user_id integer NULL
          REFERENCES users(id) ON DELETE SET NULL,
        event_type varchar(20) NOT NULL CHECK (event_type IN ('unlock')),
        period_key varchar(7) NOT NULL,
        plan_key varchar(20) NOT NULL,
        credit_limit integer NOT NULL CHECK (credit_limit >= 0),
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_employer_resume_credit_events_org_period
      ON employer_resume_credit_events (organization_id, period_key)
    `);
    await queryRunner.query(`
      ALTER TABLE email_notification_outbox
      ADD COLUMN recipient_user_id integer NULL
        REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN category varchar(40) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE email_notification_outbox
      DROP CONSTRAINT IF EXISTS email_notification_outbox_status_check
    `);
    await queryRunner.query(`
      ALTER TABLE email_notification_outbox
      ADD CONSTRAINT email_notification_outbox_status_check
      CHECK (status IN ('queued', 'sending', 'retrying', 'sent', 'failed', 'cancelled'))
    `);
    await queryRunner.query(`
      ALTER TABLE email_notification_outbox
      DROP CONSTRAINT IF EXISTS email_notification_outbox_check,
      ADD CONSTRAINT email_notification_outbox_content_check
      CHECK (
        status IN ('sent', 'failed', 'cancelled')
        OR (recipient_email IS NOT NULL AND subject IS NOT NULL AND message IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_email_notification_outbox_recipient_category
      ON email_notification_outbox (recipient_user_id, category, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_razorpay_webhook_events_received_at
      ON razorpay_webhook_events (received_at)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX UQ_payment_refunds_provider_refund_id
      ON payment_refunds (provider_refund_id)
      WHERE provider_refund_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE TABLE background_worker_heartbeats (
        instance_id varchar(100) PRIMARY KEY,
        process_role varchar(20) NOT NULL,
        process_id integer NOT NULL,
        last_seen_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_background_worker_heartbeats_last_seen
      ON background_worker_heartbeats (last_seen_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_whatsapp_notification_outbox_retention
      ON whatsapp_notification_outbox (status, sent_at, updated_at)
    `);
    await queryRunner.query(`
      CREATE TABLE job_alert_generation_outbox (
        job_id integer PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
        status varchar(20) NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
        attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        locked_at timestamptz NULL,
        last_error varchar(1000) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_job_alert_generation_outbox_due
      ON job_alert_generation_outbox (status, next_attempt_at)
      WHERE status = 'queued'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "IDX_razorpay_webhook_events_received_at"',
    );
    await queryRunner.query(
      'DROP INDEX "UQ_payment_refunds_provider_refund_id"',
    );
    await queryRunner.query(
      'DROP INDEX "IDX_background_worker_heartbeats_last_seen"',
    );
    await queryRunner.query(
      'DROP INDEX "IDX_whatsapp_notification_outbox_retention"',
    );
    await queryRunner.query('DROP INDEX "IDX_job_alert_generation_outbox_due"');
    await queryRunner.query("DROP TABLE job_alert_generation_outbox");
    await queryRunner.query("DROP TABLE background_worker_heartbeats");
    await queryRunner.query(
      'DROP INDEX "IDX_email_notification_outbox_recipient_category"',
    );
    await queryRunner.query(`
      ALTER TABLE email_notification_outbox
      DROP CONSTRAINT email_notification_outbox_status_check,
      ADD CONSTRAINT email_notification_outbox_status_check
      CHECK (status IN ('queued', 'sending', 'retrying', 'sent', 'failed'))
    `);
    await queryRunner.query(`
      ALTER TABLE email_notification_outbox
      DROP CONSTRAINT email_notification_outbox_content_check,
      ADD CONSTRAINT email_notification_outbox_check
      CHECK (
        status IN ('sent', 'failed')
        OR (recipient_email IS NOT NULL AND subject IS NOT NULL AND message IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE email_notification_outbox
      DROP COLUMN category,
      DROP COLUMN recipient_user_id
    `);
    await queryRunner.query(
      'DROP INDEX "IDX_employer_resume_credit_events_org_period"',
    );
    await queryRunner.query("DROP TABLE employer_resume_credit_events");
    await queryRunner.query(`
      UPDATE candidate_premium_orders
      SET payment_status = 'paid'
      WHERE payment_status IN ('partially_refunded', 'refunded')
    `);
    await queryRunner.query(`
      ALTER TABLE candidate_premium_orders
      DROP CONSTRAINT FK_candidate_premium_orders_user,
      DROP CONSTRAINT candidate_premium_orders_payment_status_check,
      ADD CONSTRAINT candidate_premium_orders_payment_status_check
        CHECK (payment_status IN ('pending', 'paid')),
      DROP COLUMN invoice_id,
      ALTER COLUMN user_id SET NOT NULL,
      ADD CONSTRAINT FK_candidate_premium_orders_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE employer_organizations
      DROP COLUMN past_due_started_at,
      DROP COLUMN subscription_plan_snapshot
    `);
    await queryRunner.query(`
      ALTER TABLE razorpay_configuration
      DROP COLUMN past_due_grace_days
    `);
  }
}
