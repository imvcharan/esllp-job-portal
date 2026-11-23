import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

type CalendarResult = { meetingUrl: string | null; calendarStatus: "created" | "disabled" | "failed" };

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private cachedAccessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  private async getAccessToken(): Promise<string | null> {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim();
    if (!clientId && !clientSecret && !refreshToken) return null;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new ServiceUnavailableException(
        "Google Calendar requires client ID, client secret, and refresh token.",
      );
    }
    if (this.cachedAccessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.cachedAccessToken;
    }
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      this.logger.error(
        `Google OAuth token refresh failed (HTTP ${response.status}).`,
      );
      throw new ServiceUnavailableException(
        "Google Calendar authorization could not be refreshed.",
      );
    }
    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("access_token" in payload) ||
      typeof payload.access_token !== "string" ||
      !("expires_in" in payload) ||
      typeof payload.expires_in !== "number"
    ) {
      throw new ServiceUnavailableException(
        "Google OAuth returned an invalid token response.",
      );
    }
    this.cachedAccessToken = payload.access_token;
    this.accessTokenExpiresAt =
      Date.now() + Math.max(60, payload.expires_in - 60) * 1000;
    return this.cachedAccessToken;
  }

  async createInterviewEvent(input: {
    title: string;
    description: string;
    attendeeEmail: string;
    startsAt: Date;
    durationMinutes: number;
  }): Promise<CalendarResult> {
    let accessToken: string | null;
    try {
      accessToken = await this.getAccessToken();
    } catch (error) {
      this.logger.error(
        `Google Calendar authorization error: ${error instanceof Error ? error.name : "unknown"}.`,
      );
      return { meetingUrl: null, calendarStatus: "failed" };
    }
    if (!accessToken) return { meetingUrl: null, calendarStatus: "disabled" };

    try {
      const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: input.title,
            description: input.description,
            start: { dateTime: input.startsAt.toISOString() },
            end: {
              dateTime: new Date(
                input.startsAt.getTime() + input.durationMinutes * 60_000,
              ).toISOString(),
            },
            attendees: [{ email: input.attendeeEmail }],
            conferenceData: {
              createRequest: {
                requestId: `esllp-${input.startsAt.getTime()}-${input.attendeeEmail}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) {
        this.logger.error(`Google Calendar event creation failed (HTTP ${response.status}).`);
        return { meetingUrl: null, calendarStatus: "failed" };
      }
      const payload = await response.json().catch(() => null);
      const entryPoints =
        payload && typeof payload === "object"
          ? (payload as { conferenceData?: { entryPoints?: Array<{ uri?: string }> } }).conferenceData?.entryPoints
          : null;
      return {
        meetingUrl:
          entryPoints?.find((entry) => typeof entry.uri === "string")?.uri ?? null,
        calendarStatus: "created",
      };
    } catch (error) {
      this.logger.error(
        `Google Calendar event creation error: ${error instanceof Error ? error.name : "unknown"}.`,
      );
      return { meetingUrl: null, calendarStatus: "failed" };
    }
  }
}
