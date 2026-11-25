const assert = require("node:assert/strict");
const { test } = require("node:test");
const { GoogleCalendarService } = require("../dist/employers/google-calendar.service.js");

test("Google Calendar refreshes OAuth credentials and creates a Meet interview", async () => {
  const keys = [
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REFRESH_TOKEN",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "refresh-token";
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("oauth2.googleapis.com")) {
      return new Response(
        JSON.stringify({ access_token: "access-token", expires_in: 3600 }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        id: "calendar-event-123",
        conferenceData: {
          entryPoints: [{ uri: "https://meet.google.com/example-room" }],
        },
      }),
      { status: 200 },
    );
  };

  try {
    const result = await new GoogleCalendarService().createInterviewEvent({
      title: "Interview",
      description: "Test interview",
      attendeeEmails: ["candidate@example.test", "interviewer@example.test"],
      startsAt: new Date("2026-12-01T10:00:00.000Z"),
      durationMinutes: 30,
    });
    assert.equal(result.calendarStatus, "created");
    assert.equal(result.meetingUrl, "https://meet.google.com/example-room");
    assert.equal(result.calendarEventId, "calendar-event-123");
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /oauth2\.googleapis\.com\/token/);
    assert.equal(
      calls[1].init.headers.Authorization,
      "Bearer access-token",
    );
    assert.deepEqual(JSON.parse(calls[1].init.body).attendees, [
      { email: "candidate@example.test" },
      { email: "interviewer@example.test" },
    ]);
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("Google Calendar stays optional when OAuth credentials are absent", async () => {
  const keys = [
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REFRESH_TOKEN",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  for (const key of keys) delete process.env[key];
  global.fetch = async () => {
    throw new Error("fetch should not be called");
  };

  try {
    const result = await new GoogleCalendarService().createInterviewEvent({
      title: "Interview",
      description: "Test interview",
      attendeeEmails: ["candidate@example.test"],
      startsAt: new Date("2026-12-01T10:00:00.000Z"),
      durationMinutes: 30,
    });
    assert.deepEqual(result, {
      meetingUrl: null,
      calendarEventId: null,
      calendarStatus: "disabled",
    });
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] !== undefined) process.env[key] = previous[key];
    }
  }
});
