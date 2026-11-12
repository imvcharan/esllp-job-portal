import { MigrationInterface, QueryRunner } from "typeorm";

export class JobApplicationQuestions1729000000024 implements MigrationInterface {
  name = "JobApplicationQuestions1729000000024";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE jobs
        ADD COLUMN application_questions jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE candidate_applications
        ADD COLUMN application_answers jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE candidate_applications DROP COLUMN application_answers",
    );
    await queryRunner.query(
      "ALTER TABLE jobs DROP COLUMN application_questions",
    );
  }
}
