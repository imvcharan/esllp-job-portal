import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndRefreshSessions1729000000001
  implements MigrationInterface
{
  name = 'CreateUsersAndRefreshSessions1729000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "email" varchar(254) NOT NULL,
        "password_hash" varchar(100) NOT NULL,
        "display_name" varchar(120) NOT NULL,
        "role" varchar(20) NOT NULL DEFAULT 'candidate',
        "email_verified" boolean NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT 1,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email")',
    );
    await queryRunner.query(`
      CREATE TABLE "refresh_sessions" (
        "token_hash" varchar(64) PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "expires_at" datetime NOT NULL,
        "revoked_at" datetime,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_refresh_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_refresh_sessions_user_id" ON "refresh_sessions" ("user_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "refresh_sessions"');
    await queryRunner.query('DROP INDEX "IDX_users_email"');
    await queryRunner.query('DROP TABLE "users"');
  }
}
