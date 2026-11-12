import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import nodemailer, { Transporter } from "nodemailer";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";

@Injectable()
export class EmailDeliveryService implements OnModuleInit, OnModuleDestroy {
  private static readonly failedNotificationRetentionSweepMs =
    24 * 60 * 60 * 1000;
  private readonly logger = new Logger(EmailDeliveryService.name);
  private transporter: Transporter | null = null;
  private worker: NodeJS.Timeout | null = null;
  private processing = false;
  private lastFailedNotificationRetentionSweepAt = 0;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.dataSource.query(`
      UPDATE email_notification_outbox
      SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'retrying' END,
          failed_at = CASE WHEN attempts >= 5 THEN COALESCE(failed_at, now()) ELSE NULL END,
          locked_at = NULL,
          next_attempt_at = now()
      WHERE status = 'sending'
        AND (locked_at IS NULL OR locked_at < now() - INTERVAL '2 minutes')
    `);
    await this.purgeExpiredFailedNotifications();
    this.lastFailedNotificationRetentionSweepAt = Date.now();
    this.worker = setInterval(() => {
      void this.processPendingNotifications().catch((error: unknown) => {
        this.logger.error(
          `Notification outbox worker failed: ${
            error instanceof Error ? error.message : "unknown database error"
          }`,
        );
      });
    }, 15_000);
    this.worker.unref();
  }

  onModuleDestroy(): void {
    if (this.worker) clearInterval(this.worker);
  }

  async sendAccountLink(
    email: string,
    subject: string,
    action: "verify your email" | "reset your password",
    link: string,
  ): Promise<void> {
    await this.send(
      email,
      subject,
      `Use this link to ${action}. It expires shortly and can only be used once:\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
      `<p>Use the link below to ${action}. It expires shortly and can only be used once.</p><p><a href="${this.escapeAttribute(link)}">Continue</a></p><p>If you did not request this, you can ignore this email.</p>`,
    );
  }

  async sendLoginCode(email: string, code: string): Promise<void> {
    await this.send(
      email,
      "Your esllp sign-in code",
      `Your one-time sign-in code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      `<p>Your one-time sign-in code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this code, you can ignore this email.</p>`,
    );
  }

  async sendNotification(
    email: string,
    subject: string,
    message: string,
    deduplicationKey: string = randomUUID(),
  ): Promise<"queued"> {
    if (!email.trim() || !subject.trim() || !message.trim())
      throw new ServiceUnavailableException(
        "Notification email requires a recipient, subject, and message.",
      );
    if (!deduplicationKey.trim() || deduplicationKey.length > 200)
      throw new ServiceUnavailableException(
        "Notification email deduplication key is invalid.",
      );
    await this.dataSource.query(
      `INSERT INTO email_notification_outbox
         (deduplication_key, recipient_email, subject, message)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (deduplication_key) DO NOTHING`,
      [deduplicationKey, email.trim(), subject.trim(), message],
    );
    return "queued";
  }

  async outboxSummary() {
    const [counts, failed] = await Promise.all([
      this.dataSource.query(
        `SELECT status, COUNT(*)::int AS count
         FROM email_notification_outbox
         GROUP BY status`,
      ) as Promise<Array<{ status: string; count: number | string }>>,
      this.dataSource.query(
        `SELECT id, status, attempts, last_error AS "lastError",
                created_at AS "createdAt"
         FROM email_notification_outbox
         WHERE status = 'failed'
         ORDER BY created_at DESC
         LIMIT 50`,
      ) as Promise<
        Array<{
          id: string;
          status: string;
          attempts: number;
          lastError: string | null;
          createdAt: Date;
        }>
      >,
    ]);
    return {
      counts: Object.fromEntries(
        counts.map(({ status, count }) => [status, Number(count)]),
      ),
      failed,
    };
  }

  async retryFailedNotification(id: number): Promise<boolean> {
    const result = (await this.dataSource.query(
      `UPDATE email_notification_outbox
       SET status = 'queued',
           attempts = 0,
           next_attempt_at = now(),
           locked_at = NULL,
           last_error = NULL,
           failed_at = NULL
       WHERE id = $1 AND status = 'failed' AND recipient_email IS NOT NULL
       RETURNING id`,
      [id],
    )) as Array<{ id: number }>;
    return result.length > 0;
  }

  async processPendingNotifications(limit = 10): Promise<number> {
    if (this.processing) return 0;
    this.processing = true;
    try {
      const now = Date.now();
      if (
        now - (this.lastFailedNotificationRetentionSweepAt ?? 0) >=
        EmailDeliveryService.failedNotificationRetentionSweepMs
      ) {
        await this.purgeExpiredFailedNotifications();
        this.lastFailedNotificationRetentionSweepAt = now;
      }
      const batch = (await this.dataSource.transaction((manager) =>
        manager.query(
          `WITH due AS (
             SELECT id
             FROM email_notification_outbox
             WHERE status IN ('queued', 'retrying')
               AND next_attempt_at <= now()
             ORDER BY next_attempt_at, id
             LIMIT $1
             FOR UPDATE SKIP LOCKED
           )
           UPDATE email_notification_outbox outbox
           SET status = 'sending',
               attempts = outbox.attempts + 1,
               locked_at = now()
           FROM due
           WHERE outbox.id = due.id
           RETURNING outbox.id, outbox.recipient_email AS "recipientEmail",
                     outbox.subject, outbox.message, outbox.attempts`,
          [Math.min(50, Math.max(1, limit))],
        ),
      )) as Array<{
        id: number;
        recipientEmail: string | null;
        subject: string | null;
        message: string | null;
        attempts: number;
      }>;
      for (const notification of batch) {
        try {
          if (
            !notification.recipientEmail ||
            !notification.subject ||
            !notification.message
          )
            throw new Error("Queued notification content is incomplete.");
          const escapedMessage = this.escapeHtml(notification.message);
          const linkedMessage = escapedMessage.replace(
            /(https:\/\/[^\s<]+)/g,
            '<a href="$1">$1</a>',
          );
          await this.send(
            notification.recipientEmail,
            notification.subject,
            notification.message,
            `<p>${linkedMessage}</p>`,
          );
          await this.dataSource.query(
            `UPDATE email_notification_outbox
             SET status = 'sent', recipient_email = NULL, subject = NULL,
                 message = NULL, last_error = NULL, locked_at = NULL,
                 sent_at = now()
             WHERE id = $1`,
            [notification.id],
          );
        } catch (error) {
          const lastError =
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Unknown email delivery error";
          const status = notification.attempts >= 5 ? "failed" : "retrying";
          const delaySeconds = Math.min(
            21_600,
            60 * 2 ** Math.max(0, notification.attempts - 1),
          );
          await this.dataSource.query(
            `UPDATE email_notification_outbox
             SET status = $2,
                 failed_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END,
                 next_attempt_at = now() + ($3 * INTERVAL '1 second'),
                 locked_at = NULL,
                 last_error = $4
             WHERE id = $1`,
            [notification.id, status, delaySeconds, lastError],
          );
          this.logger.error(
            `Notification email ${notification.id} failed on attempt ${notification.attempts}; status=${status}.`,
          );
        }
      }
      return batch.length;
    } finally {
      this.processing = false;
    }
  }

  async purgeExpiredFailedNotifications(): Promise<number> {
    const expired = (await this.dataSource.query(`
      UPDATE email_notification_outbox
      SET recipient_email = NULL,
          subject = NULL,
          message = NULL,
          last_error = NULL
      WHERE status = 'failed'
        AND failed_at < now() - INTERVAL '30 days'
        AND recipient_email IS NOT NULL
      RETURNING id
    `)) as Array<{ id: number }>;
    return expired.length;
  }

  private async send(
    email: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    const transporter = this.getTransporter();
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM!.trim(),
        to: email,
        subject,
        text,
        html,
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        "The account email could not be delivered. Check SMTP configuration and try again.",
        { cause: error },
      );
    }
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const host = process.env.SMTP_HOST?.trim();
    const portValue = process.env.SMTP_PORT?.trim();
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    const from = process.env.SMTP_FROM?.trim();
    if (!host || !portValue || !user || !password || !from) {
      throw new ServiceUnavailableException(
        "Account email delivery is not configured. Set the SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM server variables.",
      );
    }
    const port = Number(portValue);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException(
        "SMTP_PORT must be a valid TCP port number.",
      );
    }
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    return this.transporter;
  }

  private escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    );
  }

  private escapeAttribute(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    );
  }
}
