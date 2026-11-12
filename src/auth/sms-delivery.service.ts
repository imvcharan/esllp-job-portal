import { Injectable, ServiceUnavailableException } from "@nestjs/common";

@Injectable()
export class SmsDeliveryService {
  assertConfigured(): void {
    if (
      !process.env.TWILIO_ACCOUNT_SID?.trim() ||
      !process.env.TWILIO_AUTH_TOKEN ||
      !process.env.TWILIO_FROM_NUMBER?.trim()
    ) {
      throw new ServiceUnavailableException(
        "SMS verification is not configured. Configure Twilio credentials before registering.",
      );
    }
  }

  async sendVerificationCode(phoneNumber: string, code: string): Promise<void> {
    this.assertConfigured();
    const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_FROM_NUMBER!.trim();
    const authorization = Buffer.from(`${accountSid}:${authToken}`).toString(
      "base64",
    );
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authorization}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phoneNumber,
          From: from,
          Body: `Your esllp verification code is ${code}. It expires in 10 minutes. Do not share it.`,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `SMS provider rejected the verification message (HTTP ${response.status}).`,
      );
    }
  }
}
