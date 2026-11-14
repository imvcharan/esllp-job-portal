import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { EmailDeliveryService } from "../auth/email-delivery.service";
import { WhatsAppDeliveryService } from "../providers/whatsapp-delivery.service";

interface UpcomingInterviewReminder {
  id: number;
  userId: number;
  candidateEmail: string;
  candidatePhone: string | null;
  phoneVerified: boolean;
  whatsappOptIn: boolean;
  emailNeedsSend: boolean;
  organizationName: string;
  jobTitle: string;
  startsAt: Date | string;
  meetingUrl: string | null;
  location: string | null;
}

@Injectable()
export class InterviewReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InterviewReminderService.name);
  private worker: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly whatsappDelivery: WhatsAppDeliveryService,
  ) {}

  onModuleInit(): void {
    this.worker = setInterval(() => {
      void this.enqueueUpcomingReminders().catch((error: unknown) => {
        this.logger.error(
          `Interview reminder scan failed: ${
            error instanceof Error ? error.message : "unknown database error"
          }`,
        );
      });
    }, 60_000);
    this.worker.unref();
    void this.enqueueUpcomingReminders().catch((error: unknown) => {
      this.logger.error(
        `Initial interview reminder scan failed: ${
          error instanceof Error ? error.message : "unknown database error"
        }`,
      );
    });
  }

  onModuleDestroy(): void {
    if (this.worker) clearInterval(this.worker);
  }

  async enqueueUpcomingReminders(): Promise<number> {
    if (this.processing) return 0;
    this.processing = true;
    try {
      const whatsappReady = await this.whatsappDelivery.isReady();
      const reminders = (await this.dataSource.query(
        `
        SELECT interview.id,
               candidate.id AS "userId",
               candidate.email AS "candidateEmail",
               candidate.phone_e164 AS "candidatePhone",
               candidate.phone_verified AS "phoneVerified",
               COALESCE(profile.whatsapp_interview_reminders, false) AS "whatsappOptIn",
               (
                 COALESCE(profile.application_email_updates, true) = true
                 AND NOT EXISTS (
                   SELECT 1
                   FROM email_notification_outbox email_outbox
                   WHERE email_outbox.deduplication_key =
                     'interview-reminder-24h:' || interview.id::text
                 )
               ) AS "emailNeedsSend",
               organization.name AS "organizationName",
               job.title AS "jobTitle",
               interview.starts_at AS "startsAt",
               interview.meeting_url AS "meetingUrl",
               interview.location
        FROM employer_interviews interview
        INNER JOIN candidate_applications application
          ON application.id = interview.application_id
        INNER JOIN users candidate ON candidate.id = application.user_id
        INNER JOIN jobs job ON job.id = application.job_id
        INNER JOIN employer_organizations organization
          ON organization.id = interview.organization_id
        LEFT JOIN candidate_profiles profile
          ON profile.user_id = candidate.id
        WHERE interview.status = 'scheduled'
          AND candidate.is_active = true
          AND interview.starts_at > now() + INTERVAL '15 minutes'
          AND interview.starts_at <= now() + INTERVAL '24 hours'
          AND (
            (
              COALESCE(profile.application_email_updates, true) = true
              AND NOT EXISTS (
                SELECT 1
                FROM email_notification_outbox email_outbox
                WHERE email_outbox.deduplication_key =
                  'interview-reminder-24h:' || interview.id::text
              )
            )
            OR (
              $1::boolean = true
              AND COALESCE(profile.whatsapp_interview_reminders, false) = true
              AND candidate.phone_verified = true
              AND candidate.phone_e164 IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM whatsapp_notification_outbox whatsapp_outbox
                WHERE whatsapp_outbox.deduplication_key =
                  'interview-reminder-24h:' || interview.id::text
              )
            )
          )
        ORDER BY interview.starts_at ASC, interview.id ASC
        LIMIT 100
      `,
        [whatsappReady],
      )) as UpcomingInterviewReminder[];

      let queued = 0;
      for (const reminder of reminders) {
        const startsAt = new Date(reminder.startsAt);
        if (!Number.isFinite(startsAt.getTime())) {
          this.logger.error(
            `Interview ${reminder.id} has an invalid start time; reminder was not queued.`,
          );
          continue;
        }
        if (reminder.emailNeedsSend) {
          try {
            await this.emailDelivery.sendNotification(
              reminder.candidateEmail,
              `Upcoming interview: ${reminder.jobTitle}`,
              `Reminder for your interview at ${reminder.organizationName}.`,
              `interview-reminder-24h:${reminder.id}`,
              "interview_reminder",
              {
                organizationName: reminder.organizationName,
                jobTitle: reminder.jobTitle,
                startsAt: startsAt.toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                }),
                meetingUrl: reminder.meetingUrl
                  ? ` Join here: ${reminder.meetingUrl}`
                  : "",
                location: reminder.location
                  ? ` Location: ${reminder.location}`
                  : "",
              },
            );
            queued += 1;
          } catch (error) {
            this.logger.error(
              `Interview ${reminder.id} email reminder could not be queued: ${
                error instanceof Error
                  ? error.message
                  : "unknown notification error"
              }`,
            );
          }
        }
        if (
          whatsappReady &&
          reminder.whatsappOptIn &&
          reminder.phoneVerified &&
          reminder.candidatePhone
        ) {
          try {
            const details =
              reminder.meetingUrl || reminder.location || "See your portal";
            const inserted = await this.dataSource.query(
              `INSERT INTO whatsapp_notification_outbox
                 (user_id, deduplication_key, to_number, template_variables)
               VALUES ($1, $2, $3, $4::jsonb)
               ON CONFLICT (deduplication_key) DO NOTHING
               RETURNING id`,
              [
                reminder.userId,
                `interview-reminder-24h:${reminder.id}`,
                reminder.candidatePhone,
                JSON.stringify({
                  "1": reminder.jobTitle.slice(0, 160),
                  "2": reminder.organizationName.slice(0, 160),
                  "3": startsAt.toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  }),
                  "4": details.slice(0, 500),
                }),
              ],
            );
            queued += inserted.length;
          } catch (error) {
            this.logger.error(
              `Interview ${reminder.id} WhatsApp reminder could not be queued: ${
                error instanceof Error
                  ? error.message
                  : "unknown notification error"
              }`,
            );
          }
        }
      }
      await this.deliverWhatsAppOutbox();
      return queued;
    } finally {
      this.processing = false;
    }
  }

  private async deliverWhatsAppOutbox(): Promise<number> {
    await this.dataSource.query(`
      UPDATE whatsapp_notification_outbox
      SET status = 'failed', to_number = NULL,
          template_variables = NULL,
          last_error = 'Reminder delivery window expired',
          updated_at = now()
      WHERE status IN ('queued', 'sending')
        AND created_at < now() - INTERVAL '48 hours'
    `);
    if (!(await this.whatsappDelivery.isReady())) return 0;
    await this.dataSource.query(`
      UPDATE whatsapp_notification_outbox
      SET status = 'queued', updated_at = now()
      WHERE status = 'sending'
        AND updated_at < now() - INTERVAL '10 minutes'
    `);
    const pending = (await this.dataSource.query(`
      WITH next_batch AS (
        SELECT outbox.id
        FROM whatsapp_notification_outbox outbox
        INNER JOIN users candidate ON candidate.id = outbox.user_id
        INNER JOIN candidate_profiles profile
          ON profile.user_id = outbox.user_id
        WHERE outbox.status = 'queued'
          AND outbox.next_attempt_at <= now()
          AND candidate.is_active = true
          AND profile.whatsapp_interview_reminders = true
          AND candidate.phone_verified = true
          AND candidate.phone_e164 = outbox.to_number
        ORDER BY outbox.id
        LIMIT 20
        FOR UPDATE OF outbox SKIP LOCKED
      )
      UPDATE whatsapp_notification_outbox outbox
      SET status = 'sending',
          attempt_count = attempt_count + 1,
          updated_at = now()
      FROM next_batch
      WHERE outbox.id = next_batch.id
      RETURNING outbox.id,
                outbox.to_number AS "toNumber",
                outbox.template_variables AS "templateVariables",
                outbox.attempt_count AS "attemptCount"
    `)) as {
      id: number;
      toNumber: string;
      templateVariables: Record<string, string>;
      attemptCount: number;
    }[];
    let sent = 0;
    for (const reminder of pending) {
      try {
        await this.whatsappDelivery.sendInterviewReminder(
          reminder.toNumber,
          reminder.templateVariables,
        );
        await this.dataSource.query(
          `UPDATE whatsapp_notification_outbox
           SET status = 'sent', to_number = NULL,
               template_variables = NULL, last_error = NULL,
               sent_at = now(), updated_at = now()
           WHERE id = $1 AND status = 'sending'`,
          [reminder.id],
        );
        sent += 1;
      } catch (error) {
        const attemptCount = Number(reminder.attemptCount);
        const terminal = attemptCount >= 5;
        const retryAt = new Date(
          Date.now() +
            Math.min(60, 5 * 2 ** Math.max(0, attemptCount - 1)) * 60_000,
        );
        const lastError =
          error instanceof Error
            ? error.message.slice(0, 240)
            : "WhatsApp delivery failed";
        this.logger.error(
          `WhatsApp interview reminder ${reminder.id} failed (attempt ${attemptCount}): ${lastError}`,
        );
        await this.dataSource.query(
          `UPDATE whatsapp_notification_outbox
           SET status = $2,
               to_number = CASE WHEN $2 = 'failed' THEN NULL ELSE to_number END,
               template_variables = CASE
                 WHEN $2 = 'failed' THEN NULL ELSE template_variables
               END,
               next_attempt_at = $3, last_error = $4, updated_at = now()
           WHERE id = $1 AND status = 'sending'`,
          [reminder.id, terminal ? "failed" : "queued", retryAt, lastError],
        );
      }
    }
    return sent;
  }
}
