import { MigrationInterface, QueryRunner } from "typeorm";

export class EmployerJobLifecycleAndTrust1729000000058 implements MigrationInterface {
  name = "EmployerJobLifecycleAndTrust1729000000058";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employer_organizations
        ADD COLUMN logo_url varchar(1000) NULL,
        ADD COLUMN verification_status varchar(20) NOT NULL DEFAULT 'unsubmitted'
          CHECK (verification_status IN ('unsubmitted','pending','verified','rejected')),
        ADD COLUMN verification_details text NULL,
        ADD COLUMN verification_note text NULL,
        ADD COLUMN verification_requested_at timestamptz NULL,
        ADD COLUMN verified_at timestamptz NULL
    `);
    await queryRunner.query(`
      CREATE INDEX featured_job_placements_current_idx
      ON featured_job_placements (starts_at, ends_at, job_id)
      WHERE status IN ('scheduled', 'active')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP INDEX IF EXISTS featured_job_placements_current_idx",
    );
    await queryRunner.query(`
      ALTER TABLE employer_organizations
        DROP COLUMN verified_at,
        DROP COLUMN verification_requested_at,
        DROP COLUMN verification_note,
        DROP COLUMN verification_details,
        DROP COLUMN verification_status,
        DROP COLUMN logo_url
    `);
  }
}
