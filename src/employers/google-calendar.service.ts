import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createHash } from "node:crypto";

type CalendarResult = {
  meetingUrl: string | null;
  calendarEventId: string | null;
  calendarStatus: "created" | "disabled" | "failed";
};

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
    attendeeEmails: string[];
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
      return { meetingUrl: null, calendarEventId: null, calendarStatus: "failed" };
    }
    if (!accessToken)
      return { meetingUrl: null, calendarEventId: null, calendarStatus: "disabled" };

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
            attendees: input.attendeeEmails.map((email) => ({ email })),
            conferenceData: {
              createRequest: {
                requestId: `esllp-${input.startsAt.getTime()}-${createHash("sha256").update(input.attendeeEmails.join("|")).digest("hex").slice(0, 20)}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) {
        this.logger.error(`Google Calendar event creation failed (HTTP ${response.status}).`);
        return {
          meetingUrl: null,
          calendarEventId: null,
          calendarStatus: "failed",
        };
      }
      const payload = await response.json().catch(() => null);
      const entryPoints =
        payload && typeof payload === "object"
          ? (payload as { conferenceData?: { entryPoints?: Array<{ uri?: string }> } }).conferenceData?.entryPoints
          : null;
      return {
        meetingUrl:
          entryPoints?.find((entry) => typeof entry.uri === "string")?.uri ?? null,
        calendarEventId:
          payload &&
          typeof payload === "object" &&
          "id" in payload &&
          typeof payload.id === "string"
            ? payload.id
            : null,
        calendarStatus: "created",
      };
    } catch (error) {
      this.logger.error(
        `Google Calendar event creation error: ${error instanceof Error ? error.name : "unknown"}.`,
      );
      return { meetingUrl: null, calendarEventId: null, calendarStatus: "failed" };
    }
  }

  async updateInterviewEvent(
    eventId: string,
    startsAt: Date,
    durationMinutes: number,
    attendeeEmails: string[],
  ): Promise<"updated" | "disabled" | "failed"> {
    let accessToken: string | null;
    try {
      accessToken = await this.getAccessToken();
    } catch (error) {
      this.logger.error(
        `Google Calendar authorization error: ${error instanceof Error ? error.name : "unknown"}.`,
      );
      return "failed";
    }
    if (!accessToken) return "disabled";
    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start: { dateTime: startsAt.toISOString() },
            end: {
              dateTime: new Date(
                startsAt.getTime() + durationMinutes * 60_000,
              ).toISOString(),
            },
            attendees: attendeeEmails.map((email) => ({ email })),
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) {
        this.logger.error(
          `Google Calendar event update failed (HTTP ${response.status}).`,
        );
        return "failed";
      }
      return "updated";
    } catch (error) {
      this.logger.error(
        `Google Calendar event update error: ${error instanceof Error ? error.name : "unknown"}.`,
      );
      return "failed";
    }
  }

  async deleteInterviewEvent(eventId: string): Promise<void> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return;
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      this.logger.error(
        `Google Calendar event deletion failed (HTTP ${response.status}).`,
      );
      throw new ServiceUnavailableException(
        "The interview was cancelled, but its calendar event could not be removed.",
      );
    }
  }
}
