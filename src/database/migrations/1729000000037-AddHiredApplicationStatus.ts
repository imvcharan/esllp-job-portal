import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHiredApplicationStatus1729000000037
  implements MigrationInterface
{
  name = "AddHiredApplicationStatus1729000000037";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE candidate_applications
        DROP CONSTRAINT CHK_candidate_application_status,
        ADD CONSTRAINT CHK_candidate_application_status CHECK (
          status IN (
            'submitted', 'in_review', 'interview', 'offer', 'rejected',
            'withdrawn', 'withdrawal_requested', 'offer_accepted',
            'offer_declined', 'hired'
          )
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM candidate_applications WHERE status = 'hired'
        ) THEN
          RAISE EXCEPTION 'Cannot remove hired status while hired applications exist.';
        END IF;
      END;
      $$
    `);
    await queryRunner.query(`
      ALTER TABLE candidate_applications
        DROP CONSTRAINT CHK_candidate_application_status,
        ADD CONSTRAINT CHK_candidate_application_status CHECK (
          status IN (
            'submitted', 'in_review', 'interview', 'offer', 'rejected',
            'withdrawn', 'withdrawal_requested', 'offer_accepted',
            'offer_declined'
          )
        )
    `);
  }
}
