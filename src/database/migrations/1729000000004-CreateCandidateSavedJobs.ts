import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCandidateSavedJobs1729000000004
  implements MigrationInterface
{
  name = 'CreateCandidateSavedJobs1729000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE candidate_saved_jobs (
        user_id int NOT NULL,
        job_id int NOT NULL,
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, job_id),
        INDEX IDX_candidate_saved_jobs_job_id (job_id),
        CONSTRAINT FK_candidate_saved_jobs_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT FK_candidate_saved_jobs_job FOREIGN KEY (job_id)
          REFERENCES jobs (id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE candidate_saved_jobs');
  }
}
