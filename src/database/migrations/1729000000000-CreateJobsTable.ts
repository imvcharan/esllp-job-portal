import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateJobsTable1729000000000 implements MigrationInterface {
  name = 'CreateJobsTable1729000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "jobs" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "title" varchar(160) NOT NULL,
        "company" varchar(120) NOT NULL,
        "location" varchar(120) NOT NULL,
        "workplace_type" varchar(20) NOT NULL DEFAULT 'onsite',
        "employment_type" varchar(30) NOT NULL DEFAULT 'full-time',
        "salary_min" integer,
        "salary_max" integer,
        "experience" varchar(80),
        "description" text,
        "is_active" boolean NOT NULL DEFAULT 1,
        "created_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "jobs"');
  }
}
