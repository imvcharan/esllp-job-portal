import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCandidateApplications1729000000005
  implements MigrationInterface
{
  name = 'CreateCandidateApplications1729000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE candidate_applications (
        id int NOT NULL AUTO_INCREMENT,
        user_id int NOT NULL,
        job_id int NOT NULL,
        cover_letter text NULL,
        status varchar(20) NOT NULL DEFAULT 'submitted',
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE INDEX UQ_candidate_applications_user_job (user_id, job_id),
        INDEX IDX_candidate_applications_job_id (job_id),
        CONSTRAINT FK_candidate_applications_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT FK_candidate_applications_job FOREIGN KEY (job_id)
          REFERENCES jobs (id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE candidate_applications');
  }
}
