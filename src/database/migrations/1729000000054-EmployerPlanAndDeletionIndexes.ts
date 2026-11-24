import { MigrationInterface, QueryRunner } from "typeorm";

export class EmployerPlanAndDeletionIndexes1729000000054 implements MigrationInterface {
  name = "EmployerPlanAndDeletionIndexes1729000000054";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employer_organizations
        DROP CONSTRAINT IF EXISTS employer_organizations_plan_key_check,
        DROP CONSTRAINT IF EXISTS employer_organizations_pending_plan_key_check
    `);
    await queryRunner.query(`
      ALTER TABLE employer_organizations
        ADD CONSTRAINT CHK_employer_organizations_plan_key
          CHECK (plan_key IN ('free', 'starter', 'growth', 'business', 'enterprise')),
        ADD CONSTRAINT CHK_employer_organizations_pending_plan_key
          CHECK (
            pending_plan_key IS NULL OR
            pending_plan_key IN ('starter', 'growth', 'business', 'enterprise')
          )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_candidate_deletion_requests_scheduled_due
        ON candidate_deletion_requests (scheduled_for, id)
        WHERE status = 'scheduled'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM employer_organizations
          WHERE plan_key IN ('business', 'enterprise')
             OR pending_plan_key IN ('business', 'enterprise')
        ) THEN
          RAISE EXCEPTION
            'Cannot revert employer plan constraints while business or enterprise plans are in use.';
        END IF;
      END;
      $$
    `);
    await queryRunner.query(
      "DROP INDEX IDX_candidate_deletion_requests_scheduled_due",
    );
    await queryRunner.query(`
      ALTER TABLE employer_organizations
        DROP CONSTRAINT CHK_employer_organizations_plan_key,
        DROP CONSTRAINT CHK_employer_organizations_pending_plan_key,
        ADD CONSTRAINT employer_organizations_plan_key_check
          CHECK (plan_key IN ('free', 'starter', 'growth')),
        ADD CONSTRAINT employer_organizations_pending_plan_key_check
          CHECK (pending_plan_key IS NULL OR pending_plan_key IN ('starter', 'growth'))
    `);
  }
}
