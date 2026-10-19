import { MigrationInterface, QueryRunner } from "typeorm";

export class ExpandJobListingDetails1729000000012 implements MigrationInterface {
  name = "ExpandJobListingDetails1729000000012";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE jobs
        ADD COLUMN salary_currency varchar(3) NOT NULL DEFAULT 'INR',
        ADD COLUMN salary_period varchar(10) NOT NULL DEFAULT 'year',
        ADD COLUMN application_deadline date NULL,
        ADD COLUMN number_of_openings integer NOT NULL DEFAULT 1
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE jobs
        DROP COLUMN number_of_openings,
        DROP COLUMN application_deadline,
        DROP COLUMN salary_period,
        DROP COLUMN salary_currency
    `);
  }
}
