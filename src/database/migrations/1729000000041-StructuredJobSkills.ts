import { MigrationInterface, QueryRunner } from "typeorm";

export class StructuredJobSkills1729000000041 implements MigrationInterface {
  name = "StructuredJobSkills1729000000041";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE jobs
      ADD COLUMN skills jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE jobs DROP COLUMN skills");
  }
}
