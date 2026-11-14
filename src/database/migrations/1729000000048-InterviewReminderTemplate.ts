import { MigrationInterface, QueryRunner } from "typeorm";

export class InterviewReminderTemplate1729000000048 implements MigrationInterface {
  name = "InterviewReminderTemplate1729000000048";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO notification_email_templates
         (template_key, subject, body)
       VALUES ($1, $2, $3)`,
      [
        "interview_reminder",
        "Upcoming interview: {{jobTitle}}",
        "This is a reminder about your interview for {{jobTitle}} with {{organizationName}} on {{startsAt}}.{{meetingUrl}}{{location}}",
      ],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DELETE FROM notification_email_templates WHERE template_key = 'interview_reminder'",
    );
  }
}
