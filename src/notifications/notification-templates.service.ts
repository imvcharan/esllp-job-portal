import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { AuthenticatedUser } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { DataSource } from "typeorm";

const templates = {
  account_verification: {
    name: "Email verification",
    placeholders: ["link"],
    subject: "Verify your esllp email",
    body: "Use this link to verify your email. It expires shortly and can only be used once:\n\n{{link}}\n\nIf you did not request this, you can ignore this email.",
  },
  password_reset: {
    name: "Password reset",
    placeholders: ["link"],
    subject: "Reset your esllp password",
    body: "Use this link to reset your password. It expires shortly and can only be used once:\n\n{{link}}\n\nIf you did not request this, you can ignore this email.",
  },
  login_code: {
    name: "Sign-in code",
    placeholders: ["code"],
    subject: "Your esllp sign-in code",
    body: "Your one-time sign-in code is {{code}}. It expires in 10 minutes. If you did not request this code, you can ignore this email.",
  },
  application_status: {
    name: "Application status update",
    placeholders: ["jobTitle", "company", "status"],
    subject: "Application update: {{jobTitle}}",
    body: "Your application for {{jobTitle}} at {{company}} is now {{status}}.",
  },
  application_received: {
    name: "New application received",
    placeholders: ["jobTitle", "company"],
    subject: "New application received: {{jobTitle}}",
    body: "A candidate submitted an application for {{jobTitle}} at {{company}}. Sign in to your esllp employer workspace to review applicants.",
  },
  job_alert: {
    name: "Candidate job alert",
    placeholders: ["jobTitle", "company", "location", "savedSearchNames", "jobUrl"],
    subject: "New job matching your preferences: {{jobTitle}}",
    body: "{{jobTitle}} at {{company}} in {{location}} matches your saved job preferences{{savedSearchNames}}.{{jobUrl}}",
  },
  interview_scheduled: {
    name: "Interview invitation",
    placeholders: ["organizationName", "jobTitle", "startsAt", "meetingUrl", "location"],
    subject: "Interview invitation: {{jobTitle}}",
    body: "The hiring team at {{organizationName}} scheduled an interview for {{jobTitle}} on {{startsAt}}.{{meetingUrl}}{{location}}",
  },
  interview_cancelled: {
    name: "Interview cancellation",
    placeholders: ["jobTitle", "company"],
    subject: "Interview cancelled: {{jobTitle}}",
    body: "The interview for {{jobTitle}} at {{company}} has been cancelled. Contact the hiring team if you need more information.",
  },
  interview_reminder: {
    name: "Upcoming interview reminder",
    placeholders: ["organizationName", "jobTitle", "startsAt", "meetingUrl", "location"],
    subject: "Upcoming interview: {{jobTitle}}",
    body: "This is a reminder about your interview for {{jobTitle}} with {{organizationName}} on {{startsAt}}.{{meetingUrl}}{{location}}",
  },
  team_invitation: {
    name: "Company team invitation",
    placeholders: ["organizationName", "invitationMessage"],
    subject: "Invitation to join {{organizationName}} on esllp",
    body: "{{invitationMessage}}",
  },
} as const;

export type NotificationEmailTemplateKey = keyof typeof templates;

interface TemplateRow {
  key: NotificationEmailTemplateKey;
  subject: string;
  body: string;
  customized: boolean;
  updatedAt: Date | null;
}

@Injectable()
export class NotificationTemplatesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    const rows = (await this.dataSource.query(
      `SELECT template_key AS "key", subject, body, customized,
              updated_at AS "updatedAt"
       FROM notification_email_templates
       ORDER BY template_key`,
    )) as TemplateRow[];
    if (rows.length !== Object.keys(templates).length)
      throw new ServiceUnavailableException(
        "Notification email templates are not fully initialized.",
      );
    return rows.map((row) => {
      const definition = templates[row.key];
      if (!definition)
        throw new ServiceUnavailableException(
          "An unsupported notification email template is stored.",
        );
      return {
        ...row,
        name: definition.name,
        placeholders: definition.placeholders,
      };
    });
  }

  async render(
    key: NotificationEmailTemplateKey,
    values: Record<string, string>,
  ): Promise<{ subject: string; body: string }> {
    const definition = templates[key];
    if (!definition) throw new NotFoundException("Email template not found.");
    const rows = (await this.dataSource.query(
      `SELECT subject, body
       FROM notification_email_templates
       WHERE template_key = $1`,
      [key],
    )) as Array<{ subject: string; body: string }>;
    const row = rows[0];
    if (!row)
      throw new ServiceUnavailableException(
        "Notification email templates are not initialized.",
      );
    const interpolate = (input: string, subject = false) =>
      input.replace(
        /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g,
        (_match, placeholder: string) => {
          const value = values[placeholder] ?? "";
          return subject ? value.replace(/[\r\n]+/g, " ") : value;
        },
      );
    return {
      subject: interpolate(row.subject, true),
      body: interpolate(row.body),
    };
  }

  async update(
    key: string,
    subject: string,
    body: string,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    const templateKey = this.requireTemplate(key);
    this.validateContent(templateKey, subject, body);
    return this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `UPDATE notification_email_templates
         SET subject = $2, body = $3, customized = true,
             updated_at = now(), updated_by_user_id = $4
         WHERE template_key = $1
         RETURNING template_key AS "key", subject, body, customized,
                   updated_at AS "updatedAt"`,
        [templateKey, subject.trim(), body.trim(), actor.id],
      )) as TemplateRow[];
      if (!rows[0]) throw new NotFoundException("Email template not found.");
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: "notification_template.updated",
          targetType: "notification_email_template",
          targetId: templateKey,
          details: { reason: reason.trim() },
        },
        manager,
      );
      return { ...rows[0], name: templates[templateKey].name, placeholders: templates[templateKey].placeholders };
    });
  }

  async reset(key: string, reason: string, actor: AuthenticatedUser) {
    const templateKey = this.requireTemplate(key);
    const definition = templates[templateKey];
    return this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `UPDATE notification_email_templates
         SET subject = $2, body = $3, customized = false,
             updated_at = now(), updated_by_user_id = $4
         WHERE template_key = $1
         RETURNING template_key AS "key", subject, body, customized,
                   updated_at AS "updatedAt"`,
        [templateKey, definition.subject, definition.body, actor.id],
      )) as TemplateRow[];
      if (!rows[0]) throw new NotFoundException("Email template not found.");
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: "notification_template.reset",
          targetType: "notification_email_template",
          targetId: templateKey,
          details: { reason: reason.trim() },
        },
        manager,
      );
      return { ...rows[0], name: definition.name, placeholders: definition.placeholders };
    });
  }

  private requireTemplate(key: string): NotificationEmailTemplateKey {
    if (!Object.hasOwn(templates, key))
      throw new NotFoundException("Email template not found.");
    return key as NotificationEmailTemplateKey;
  }

  private validateContent(
    key: NotificationEmailTemplateKey,
    subject: string,
    body: string,
  ): void {
    if (!subject.trim() || subject.trim().length > 300)
      throw new BadRequestException(
        "Email template subject must contain 1 to 300 characters.",
      );
    if (!body.trim() || body.trim().length > 10000)
      throw new BadRequestException(
        "Email template body must contain 1 to 10000 characters.",
      );
    const allowed = new Set<string>(templates[key].placeholders);
    const placeholders = `${subject}\n${body}`.matchAll(/\{\{([^{}]+)\}\}/g);
    for (const match of placeholders) {
      if (!allowed.has(match[1]))
        throw new BadRequestException(
          `Unsupported placeholder {{${match[1]}}} for this email template.`,
        );
    }
    if (/\{\{|\}\}/.test(`${subject}\n${body}`.replace(/\{\{[^{}]+\}\}/g, "")))
      throw new BadRequestException("Email template contains a malformed placeholder.");
  }
}
