import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { TwilioConfigurationService } from "../providers/twilio-configuration.service";

@Injectable()
export class SmsDeliveryService {
  private readonly logger = new Logger(SmsDeliveryService.name);

  constructor(private readonly configuration: TwilioConfigurationService) {}

  async assertConfigured(): Promise<void> {
    await this.configuration.credentials();
  }

  async sendVerificationCode(phoneNumber: string, code: string): Promise<void> {
    const { accountSid, authToken, fromNumber } =
      await this.configuration.credentials();
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
          From: fromNumber,
          Body: `Your esllp verification code is ${code}. It expires in 10 minutes. Do not share it.`,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      const responseBody = await response.text();
      let providerCode: number | undefined;
      try {
        const providerError = JSON.parse(responseBody) as { code?: unknown };
        if (typeof providerError.code === "number") {
          providerCode = providerError.code;
        }
      } catch {
        this.logger.warn(
          `Twilio returned a non-JSON error response (HTTP ${response.status}).`,
        );
      }
      this.logger.error(
        `Twilio rejected a verification SMS (HTTP ${response.status}${
          providerCode === undefined ? "" : `, error code ${providerCode}`
        }).`,
      );
      throw new ServiceUnavailableException(
        `SMS provider rejected the verification message (HTTP ${response.status}).`,
      );
    }
  }
}
