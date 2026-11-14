import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

type GoogleRecaptchaResponse = {
  success?: boolean;
  hostname?: string;
};

@Injectable()
export class CaptchaVerificationService {
  publicConfiguration() {
    const siteKey = process.env.RECAPTCHA_SITE_KEY?.trim();
    const secretKey = process.env.RECAPTCHA_SECRET_KEY?.trim();
    if (Boolean(siteKey) !== Boolean(secretKey))
      throw new ServiceUnavailableException(
        "Both RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY must be configured.",
      );
    return {
      captchaSiteKey: siteKey || null,
      captchaRequired: process.env.NODE_ENV === "production",
    };
  }

  async verify(token: string | undefined, remoteIp?: string) {
    const { captchaSiteKey } = this.publicConfiguration();
    const secretKey = process.env.RECAPTCHA_SECRET_KEY?.trim();
    if (!captchaSiteKey || !secretKey) {
      if (process.env.NODE_ENV === "production")
        throw new ServiceUnavailableException(
          "CAPTCHA verification is not configured.",
        );
      return;
    }
    if (!token?.trim())
      throw new BadRequestException("Complete the CAPTCHA challenge.");

    const body = new URLSearchParams({
      secret: secretKey,
      response: token.trim(),
    });
    if (remoteIp) body.set("remoteip", remoteIp);

    let response: Response;
    try {
      response = await fetch(
        "https://www.google.com/recaptcha/api/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          signal: AbortSignal.timeout(5_000),
        },
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        "CAPTCHA verification service could not be reached.",
        { cause: error },
      );
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        `CAPTCHA verification service returned HTTP ${response.status}.`,
      );

    let result: GoogleRecaptchaResponse;
    try {
      result = (await response.json()) as GoogleRecaptchaResponse;
    } catch (error) {
      throw new ServiceUnavailableException(
        "CAPTCHA verification service returned an invalid response.",
        { cause: error },
      );
    }
    if (!result.success)
      throw new ForbiddenException("CAPTCHA verification failed.");

    const allowedHostnames = process.env.RECAPTCHA_ALLOWED_HOSTNAMES?.split(
      ",",
    )
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean);
    if (
      allowedHostnames?.length &&
      (!result.hostname ||
        !allowedHostnames.includes(result.hostname.toLowerCase()))
    )
      throw new ForbiddenException("CAPTCHA verification failed.");
  }
}
