import { MigrationInterface, QueryRunner } from "typeorm";

export class EmployerPlanCatalog1729000000021 implements MigrationInterface {
  name = "EmployerPlanCatalog1729000000021";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE razorpay_configuration
        ADD COLUMN business_plan_id varchar(100) NULL,
        ADD COLUMN business_amount_paise integer NULL
          CHECK (business_amount_paise IS NULL OR business_amount_paise >= 0),
        ADD COLUMN enterprise_plan_id varchar(100) NULL,
        ADD COLUMN enterprise_amount_paise integer NULL
          CHECK (enterprise_amount_paise IS NULL OR enterprise_amount_paise >= 0),
        ADD COLUMN starter_active_jobs integer NOT NULL DEFAULT 5
          CHECK (starter_active_jobs > 0),
        ADD COLUMN starter_seats integer NOT NULL DEFAULT 3
          CHECK (starter_seats > 0),
        ADD COLUMN starter_resume_credits integer NOT NULL DEFAULT 0
          CHECK (starter_resume_credits >= 0),
        ADD COLUMN growth_active_jobs integer NOT NULL DEFAULT 25
          CHECK (growth_active_jobs > 0),
        ADD COLUMN growth_seats integer NOT NULL DEFAULT 10
          CHECK (growth_seats > 0),
        ADD COLUMN growth_resume_credits integer NOT NULL DEFAULT 25
          CHECK (growth_resume_credits >= 0),
        ADD COLUMN business_active_jobs integer NOT NULL DEFAULT 75
          CHECK (business_active_jobs > 0),
        ADD COLUMN business_seats integer NOT NULL DEFAULT 25
          CHECK (business_seats > 0),
        ADD COLUMN business_resume_credits integer NOT NULL DEFAULT 100
          CHECK (business_resume_credits >= 0),
        ADD COLUMN enterprise_active_jobs integer NOT NULL DEFAULT 1000
          CHECK (enterprise_active_jobs > 0),
        ADD COLUMN enterprise_seats integer NOT NULL DEFAULT 100
          CHECK (enterprise_seats > 0),
        ADD COLUMN enterprise_resume_credits integer NOT NULL DEFAULT 500
          CHECK (enterprise_resume_credits >= 0)
    `);
    await queryRunner.query(`
      UPDATE razorpay_configuration
      SET starter_amount_paise = COALESCE(starter_amount_paise, 299900),
          growth_amount_paise = COALESCE(growth_amount_paise, 999900),
          business_amount_paise = COALESCE(business_amount_paise, 2499900)
      WHERE id = 1
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE razorpay_configuration
        DROP COLUMN enterprise_seats,
        DROP COLUMN enterprise_active_jobs,
        DROP COLUMN enterprise_resume_credits,
        DROP COLUMN business_seats,
        DROP COLUMN business_active_jobs,
        DROP COLUMN business_resume_credits,
        DROP COLUMN growth_seats,
        DROP COLUMN growth_active_jobs,
        DROP COLUMN growth_resume_credits,
        DROP COLUMN starter_seats,
        DROP COLUMN starter_active_jobs,
        DROP COLUMN starter_resume_credits,
        DROP COLUMN enterprise_amount_paise,
        DROP COLUMN enterprise_plan_id,
        DROP COLUMN business_amount_paise,
        DROP COLUMN business_plan_id
    `);
  }
}
