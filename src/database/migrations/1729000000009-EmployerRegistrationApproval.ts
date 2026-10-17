import { MigrationInterface, QueryRunner } from "typeorm";

export class EmployerRegistrationApproval1729000000009 implements MigrationInterface {
  name = "EmployerRegistrationApproval1729000000009";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN company_name varchar(160) NULL,
        ADD COLUMN company_website varchar(500) NULL,
        ADD COLUMN employer_approval_status varchar(20) NOT NULL DEFAULT 'not_applicable',
        ADD CONSTRAINT CHK_users_employer_approval_status
          CHECK (employer_approval_status IN ('not_applicable', 'pending', 'approved', 'rejected'))
    `);
    await queryRunner.query(`
      UPDATE users
      SET employer_approval_status = 'approved'
      WHERE role = 'employer'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP CONSTRAINT CHK_users_employer_approval_status,
        DROP COLUMN employer_approval_status,
        DROP COLUMN company_website,
        DROP COLUMN company_name
    `);
  }
}
