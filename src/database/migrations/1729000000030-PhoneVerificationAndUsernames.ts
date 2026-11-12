import { MigrationInterface, QueryRunner } from "typeorm";

export class PhoneVerificationAndUsernames1729000000030 implements MigrationInterface {
  name = "PhoneVerificationAndUsernames1729000000030";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN username varchar(30) NULL,
        ADD COLUMN phone_e164 varchar(16) NULL,
        ADD COLUMN pending_phone_e164 varchar(16) NULL,
        ADD COLUMN phone_verified boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE users
      SET username = 'user-' || id::text
      WHERE username IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX UQ_users_username ON users (username)
      WHERE username IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX UQ_users_phone_e164 ON users (phone_e164)
      WHERE phone_e164 IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE candidate_profiles
      ADD COLUMN public_profile_enabled boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE auth_tokens DROP CONSTRAINT CHK_auth_tokens_purpose,
        ADD CONSTRAINT CHK_auth_tokens_purpose
          CHECK (purpose IN ('email_verification', 'password_reset', 'email_otp', 'phone_verification'))
    `);
    await queryRunner.query(`
      CREATE FUNCTION assign_default_user_username() RETURNS trigger AS $$
      BEGIN
        IF NEW.username IS NULL OR btrim(NEW.username) = '' THEN
          NEW.username := 'user-' || NEW.id::text;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER TR_users_default_username
      BEFORE INSERT ON users
      FOR EACH ROW EXECUTE FUNCTION assign_default_user_username()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TRIGGER TR_users_default_username ON users");
    await queryRunner.query("DROP FUNCTION assign_default_user_username()");
    await queryRunner.query(`
      ALTER TABLE auth_tokens DROP CONSTRAINT CHK_auth_tokens_purpose,
        ADD CONSTRAINT CHK_auth_tokens_purpose
          CHECK (purpose IN ('email_verification', 'password_reset', 'email_otp'))
    `);
    await queryRunner.query(
      "ALTER TABLE candidate_profiles DROP COLUMN public_profile_enabled",
    );
    await queryRunner.query("DROP INDEX UQ_users_phone_e164");
    await queryRunner.query("DROP INDEX UQ_users_username");
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN username,
        DROP COLUMN phone_e164,
        DROP COLUMN pending_phone_e164,
        DROP COLUMN phone_verified
    `);
  }
}
