import { MigrationInterface, QueryRunner } from "typeorm";

export class CandidateApplicationAssignee1729000000044 implements MigrationInterface {
  name = "CandidateApplicationAssignee1729000000044";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE candidate_applications
      ADD COLUMN assigned_to_user_id integer NULL,
      ADD CONSTRAINT FK_candidate_applications_assignee
        FOREIGN KEY (assigned_to_user_id) REFERENCES users (id) ON DELETE SET NULL
    `);
    await queryRunner.query(
      "CREATE INDEX IDX_candidate_applications_assignee ON candidate_applications (assigned_to_user_id)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX IDX_candidate_applications_assignee");
    await queryRunner.query(`
      ALTER TABLE candidate_applications
      DROP CONSTRAINT FK_candidate_applications_assignee,
      DROP COLUMN assigned_to_user_id
    `);
  }
}
