import { MigrationInterface, QueryRunner } from "typeorm";

export class EmployerApplicationScorecards1729000000026
  implements MigrationInterface
{
  name = "EmployerApplicationScorecards1729000000026";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE employer_application_scorecards (
        id SERIAL PRIMARY KEY,
        organization_id integer NOT NULL
          REFERENCES employer_organizations(id) ON DELETE CASCADE,
        application_id integer NOT NULL
          REFERENCES candidate_applications(id) ON DELETE CASCADE,
        reviewer_user_id integer NOT NULL
          REFERENCES users(id) ON DELETE CASCADE,
        scores jsonb NOT NULL,
        recommendation varchar(20) NOT NULL
          CHECK (recommendation IN ('strong_yes', 'yes', 'maybe', 'no')),
        notes text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT UQ_employer_application_scorecard_reviewer
          UNIQUE (organization_id, application_id, reviewer_user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_employer_application_scorecards_application
      ON employer_application_scorecards (organization_id, application_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP TABLE employer_application_scorecards",
    );
  }
}
