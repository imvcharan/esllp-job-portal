import { MigrationInterface, QueryRunner } from "typeorm";

export class EmployerBillingProfile1729000000061 implements MigrationInterface {
  name = "EmployerBillingProfile1729000000061";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employer_organizations
        ADD COLUMN billing_legal_name varchar(180) NULL,
        ADD COLUMN billing_email varchar(254) NULL,
        ADD COLUMN billing_tax_id varchar(30) NULL,
        ADD COLUMN billing_address text NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employer_organizations
        DROP COLUMN IF EXISTS billing_address,
        DROP COLUMN IF EXISTS billing_tax_id,
        DROP COLUMN IF EXISTS billing_email,
        DROP COLUMN IF EXISTS billing_legal_name
    `);
  }
}
