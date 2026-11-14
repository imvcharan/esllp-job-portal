import { MigrationInterface, QueryRunner } from "typeorm";

export class AdminJobTaxonomies1729000000039 implements MigrationInterface {
  name = "AdminJobTaxonomies1729000000039";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_configuration
        ADD COLUMN job_categories jsonb NOT NULL DEFAULT '[
          "Accounting", "Administration", "Customer Service", "Design",
          "Education", "Engineering", "Finance", "Healthcare",
          "Human Resources", "Information Technology", "Legal", "Marketing",
          "Operations", "Sales", "Other"
        ]'::jsonb,
        ADD COLUMN industries jsonb NOT NULL DEFAULT '[
          "Education", "Finance", "Government", "Healthcare", "Hospitality",
          "Manufacturing", "Media", "Retail", "Technology", "Other"
        ]'::jsonb,
        ADD COLUMN locations jsonb NOT NULL DEFAULT '[
          "Bengaluru", "Chennai", "Delhi NCR", "Hyderabad", "Kolkata",
          "Mumbai", "Pune", "Remote"
        ]'::jsonb,
        ADD COLUMN employment_types jsonb NOT NULL DEFAULT '[
          "full-time", "part-time", "contract", "internship", "temporary"
        ]'::jsonb,
        ADD COLUMN workplace_types jsonb NOT NULL DEFAULT '[
          "onsite", "hybrid", "remote"
        ]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE jobs
        ADD COLUMN category varchar(80),
        ADD COLUMN industry varchar(100)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE jobs DROP COLUMN industry, DROP COLUMN category",
    );
    await queryRunner.query(`
      ALTER TABLE platform_configuration
        DROP COLUMN workplace_types,
        DROP COLUMN employment_types,
        DROP COLUMN locations,
        DROP COLUMN industries,
        DROP COLUMN job_categories
    `);
  }
}
