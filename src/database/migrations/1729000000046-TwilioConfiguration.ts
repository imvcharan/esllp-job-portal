import { MigrationInterface, QueryRunner } from "typeorm";

export class TwilioConfiguration1729000000046 implements MigrationInterface {
  name = "TwilioConfiguration1729000000046";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE twilio_configuration (
        id smallint PRIMARY KEY,
        enabled boolean NOT NULL DEFAULT false,
        account_sid varchar(64),
        auth_token_encrypted text,
        from_number varchar(40),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE twilio_configuration");
  }
}
