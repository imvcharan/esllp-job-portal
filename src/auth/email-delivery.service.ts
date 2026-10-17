import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import nodemailer, { Transporter } from "nodemailer";

@Injectable()
export class EmailDeliveryService {
  private transporter: Transporter | null = null;

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

  async sendNotification(
    email: string,
    subject: string,
    message: string,
  ): Promise<void> {
    const escapedMessage = this.escapeHtml(message);
    const linkedMessage = escapedMessage.replace(
      /(https:\/\/[^\s<]+)/g,
      '<a href="$1">$1</a>',
    );
    await this.send(email, subject, message, `<p>${linkedMessage}</p>`);
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
