import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCandidateProfiles1729000000003
  implements MigrationInterface
{
  name = 'CreateCandidateProfiles1729000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE candidate_profiles (
        user_id int NOT NULL,
        headline varchar(160) NOT NULL DEFAULT '',
        location varchar(120) NOT NULL DEFAULT '',
        phone varchar(32) NOT NULL DEFAULT '',
        summary text NOT NULL,
        skills text NOT NULL,
        updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id),
        CONSTRAINT FK_candidate_profiles_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE candidate_profiles');
  }
}
