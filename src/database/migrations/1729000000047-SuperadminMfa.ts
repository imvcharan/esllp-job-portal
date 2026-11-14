import { MigrationInterface, QueryRunner } from "typeorm";

export class SuperadminMfa1729000000047 implements MigrationInterface {
  name = "SuperadminMfa1729000000047";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE refresh_sessions
      ADD COLUMN mfa_verified boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE TABLE superadmin_mfa (
        user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        secret_encrypted text,
        pending_secret_encrypted text,
        enabled boolean NOT NULL DEFAULT false,
        last_totp_step integer,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE superadmin_mfa_recovery_codes (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash varchar(64) NOT NULL,
        used_at timestamptz,
        CONSTRAINT UQ_superadmin_mfa_recovery_code UNIQUE (user_id, code_hash)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_superadmin_mfa_recovery_codes_unused
      ON superadmin_mfa_recovery_codes (user_id, code_hash)
      WHERE used_at IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP INDEX IDX_superadmin_mfa_recovery_codes_unused",
    );
    await queryRunner.query("DROP TABLE superadmin_mfa_recovery_codes");
    await queryRunner.query("DROP TABLE superadmin_mfa");
    await queryRunner.query(
      "ALTER TABLE refresh_sessions DROP COLUMN mfa_verified",
    );
  }
}
