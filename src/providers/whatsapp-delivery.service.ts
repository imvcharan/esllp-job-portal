import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { TwilioConfigurationService } from "./twilio-configuration.service";

@Injectable()
export class WhatsAppDeliveryService {
  constructor(private readonly configuration: TwilioConfigurationService) {}

  async isReady(): Promise<boolean> {
    const configuration = await this.configuration.adminView();
    return configuration.whatsappReady;
  }

  async sendInterviewReminder(
    toNumber: string,
    variables: Record<string, string>,
  ): Promise<void> {
    const { accountSid, authToken, from, templateSid } =
      await this.configuration.whatsappCredentials();
    const to = `whatsapp:${toNumber}`;
    if (!/^whatsapp:\+\d{7,15}$/.test(to))
      throw new ServiceUnavailableException(
        "Candidate phone number is not valid for WhatsApp delivery.",
      );
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${accountSid}:${authToken}`,
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          From: from,
          ContentSid: templateSid,
          ContentVariables: JSON.stringify(variables),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok)
      throw new ServiceUnavailableException(
        `WhatsApp provider rejected the reminder (HTTP ${response.status}).`,
      );
  }
}
