import { MigrationInterface, QueryRunner } from "typeorm";

export class CandidateOnboardingProgress1729000000034 implements MigrationInterface {
  name = "CandidateOnboardingProgress1729000000034";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE candidate_profiles
        ADD COLUMN onboarding_step smallint NOT NULL DEFAULT 1,
        ADD CONSTRAINT "CHK_candidate_profiles_onboarding_step"
          CHECK (onboarding_step BETWEEN 1 AND 5)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE candidate_profiles
        DROP CONSTRAINT "CHK_candidate_profiles_onboarding_step",
        DROP COLUMN onboarding_step
    `);
  }
}
