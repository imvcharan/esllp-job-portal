import { MigrationInterface, QueryRunner } from "typeorm";

export class RequiredApplicationDocuments1729000000027
  implements MigrationInterface
{
  name = "RequiredApplicationDocuments1729000000027";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE jobs
        ADD COLUMN required_documents jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      CREATE TABLE candidate_application_documents (
        id SERIAL PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        application_id integer NULL
          REFERENCES candidate_applications(id) ON DELETE CASCADE,
        document_id varchar(40) NOT NULL,
        document_label varchar(120) NOT NULL,
        file_path text NOT NULL,
        file_name varchar(255) NOT NULL,
        content_type varchar(100) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_candidate_application_documents_owner_job
      ON candidate_application_documents (user_id, job_id, document_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_candidate_application_documents_application
      ON candidate_application_documents (application_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE candidate_application_documents");
    await queryRunner.query("ALTER TABLE jobs DROP COLUMN required_documents");
  }
}
