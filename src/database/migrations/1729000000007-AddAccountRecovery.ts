import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAccountRecovery1729000000007 implements MigrationInterface {
  name = "AddAccountRecovery1729000000007";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
      SET email_verified = true
      WHERE email_verified = false
    `);
    await queryRunner.query(`
      CREATE TABLE auth_tokens (
        token_hash varchar(64) NOT NULL,
        user_id int NOT NULL,
        purpose varchar(32) NOT NULL,
        expires_at timestamp with time zone NOT NULL,
        used_at timestamp with time zone NULL,
        created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (token_hash),
        CONSTRAINT FK_auth_tokens_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT CHK_auth_tokens_purpose
          CHECK (purpose IN ('email_verification', 'password_reset'))
      )
    `);
    await queryRunner.query(
      "CREATE INDEX IDX_auth_tokens_user_purpose ON auth_tokens (user_id, purpose)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE auth_tokens");
  }
}
