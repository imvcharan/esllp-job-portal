import { MigrationInterface, QueryRunner } from "typeorm";

export class RazorpayDashboardConfiguration1729000000020
  implements MigrationInterface
{
  name = "RazorpayDashboardConfiguration1729000000020";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE razorpay_configuration (
        id smallint PRIMARY KEY CHECK (id = 1),
        key_id varchar(255) NULL,
        enabled boolean NOT NULL DEFAULT false,
        api_secret_encrypted text NULL,
        webhook_secret_encrypted text NULL,
        starter_plan_id varchar(100) NULL,
        starter_amount_paise integer NULL
          CHECK (starter_amount_paise IS NULL OR starter_amount_paise >= 0),
        growth_plan_id varchar(100) NULL,
        growth_amount_paise integer NULL
          CHECK (growth_amount_paise IS NULL OR growth_amount_paise >= 0),
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE razorpay_configuration");
  }
}
