import { MigrationInterface, QueryRunner } from "typeorm";

export class EmployerSubscriptionPayments1729000000036
  implements MigrationInterface
{
  name = "EmployerSubscriptionPayments1729000000036";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE employer_subscription_payments (
        id SERIAL PRIMARY KEY,
        organization_id integer NOT NULL
          REFERENCES employer_organizations(id) ON DELETE RESTRICT,
        subscription_id varchar(100) NOT NULL,
        razorpay_payment_id varchar(100) NOT NULL UNIQUE,
        invoice_id varchar(100) NULL,
        plan_key varchar(20) NULL,
        amount_paise bigint NOT NULL CHECK (amount_paise > 0),
        currency varchar(3) NOT NULL,
        paid_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_employer_subscription_payments_paid_at"
      ON employer_subscription_payments (paid_at)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_employer_subscription_payments_org_paid_at"
      ON employer_subscription_payments (organization_id, paid_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "IDX_employer_subscription_payments_org_paid_at"',
    );
    await queryRunner.query(
      'DROP INDEX "IDX_employer_subscription_payments_paid_at"',
    );
    await queryRunner.query("DROP TABLE employer_subscription_payments");
  }
}
