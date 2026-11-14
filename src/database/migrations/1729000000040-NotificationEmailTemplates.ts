import { MigrationInterface, QueryRunner } from "typeorm";

const defaults = [
  [
    "account_verification",
    "Verify your esllp email",
    "Use this link to verify your email. It expires shortly and can only be used once:\n\n{{link}}\n\nIf you did not request this, you can ignore this email.",
  ],
  [
    "password_reset",
    "Reset your esllp password",
    "Use this link to reset your password. It expires shortly and can only be used once:\n\n{{link}}\n\nIf you did not request this, you can ignore this email.",
  ],
  [
    "login_code",
    "Your esllp sign-in code",
    "Your one-time sign-in code is {{code}}. It expires in 10 minutes. If you did not request this code, you can ignore this email.",
  ],
  [
    "application_status",
    "Application update: {{jobTitle}}",
    "Your application for {{jobTitle}} at {{company}} is now {{status}}.",
  ],
  [
    "application_received",
    "New application received: {{jobTitle}}",
    "A candidate submitted an application for {{jobTitle}} at {{company}}. Sign in to your esllp employer workspace to review applicants.",
  ],
  [
    "job_alert",
    "New job matching your preferences: {{jobTitle}}",
    "{{jobTitle}} at {{company}} in {{location}} matches your saved job preferences{{savedSearchNames}}.{{jobUrl}}",
  ],
  [
    "interview_scheduled",
    "Interview invitation: {{jobTitle}}",
    "The hiring team at {{organizationName}} scheduled an interview for {{jobTitle}} on {{startsAt}}.{{meetingUrl}}{{location}}",
  ],
  [
    "interview_cancelled",
    "Interview cancelled: {{jobTitle}}",
    "The interview for {{jobTitle}} at {{company}} has been cancelled. Contact the hiring team if you need more information.",
  ],
  [
    "team_invitation",
    "Invitation to join {{organizationName}} on esllp",
    "{{invitationMessage}}",
  ],
] as const;

export class NotificationEmailTemplates1729000000040
  implements MigrationInterface
{
  name = "NotificationEmailTemplates1729000000040";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notification_email_templates (
        template_key varchar(60) PRIMARY KEY,
        subject varchar(300) NOT NULL,
        body text NOT NULL,
        customized boolean NOT NULL DEFAULT false,
        updated_by_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    for (const [key, subject, body] of defaults) {
      await queryRunner.query(
        `INSERT INTO notification_email_templates
           (template_key, subject, body)
         VALUES ($1, $2, $3)`,
        [key, subject, body],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE notification_email_templates");
  }
}
