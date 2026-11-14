const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  InterviewReminderService,
} = require("../dist/employers/interview-reminder.service.js");

function createService(reminders) {
  const service = Object.create(InterviewReminderService.prototype);
  service.processing = false;
  service.logger = { error: () => undefined };
  service.dataSource = {
    query: async (sql) => {
      service.sql = service.sql ?? sql;
      return reminders;
    },
  };
  service.queued = [];
  service.emailDelivery = {
    sendNotification: async (...args) => service.queued.push(args),
  };
  service.whatsappDelivery = {
    isReady: async () => false,
    sendInterviewReminder: async () => undefined,
  };
  return service;
}

test("upcoming interviews queue one deduplicated reminder using the editable template", async () => {
  const service = createService([
    {
      id: 21,
      userId: 42,
      candidateEmail: "candidate@example.test",
      candidatePhone: null,
      phoneVerified: false,
      whatsappOptIn: false,
      emailNeedsSend: true,
      organizationName: "Example Co",
      jobTitle: "Engineer",
      startsAt: "2026-11-15T10:00:00.000Z",
      meetingUrl: "https://meet.example.test/room",
      location: null,
    },
  ]);

  assert.equal(await service.enqueueUpcomingReminders(), 1);
  assert.match(service.sql, /interview\.status = 'scheduled'/);
  assert.match(service.sql, /candidate\.is_active = true/);
  assert.match(service.sql, /starts_at <= now\(\) \+ INTERVAL '24 hours'/);
  assert.match(service.sql, /application_email_updates/);
  assert.match(service.sql, /interview-reminder-24h:/);
  assert.equal(service.queued.length, 1);
  assert.equal(service.queued[0][0], "candidate@example.test");
  assert.equal(service.queued[0][3], "interview-reminder-24h:21");
  assert.equal(service.queued[0][4], "interview_reminder");
  assert.deepEqual(service.queued[0][5], {
    organizationName: "Example Co",
    jobTitle: "Engineer",
    startsAt: new Date("2026-11-15T10:00:00.000Z").toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    }),
    meetingUrl: " Join here: https://meet.example.test/room",
    location: "",
  });
});

test("WhatsApp reminders are queued only for opted-in candidates with verified phones", async () => {
  const service = createService([
    {
      id: 21,
      userId: 42,
      candidateEmail: "candidate@example.test",
      candidatePhone: "+15551112222",
      phoneVerified: true,
      whatsappOptIn: true,
      emailEnabled: false,
      emailNeedsSend: false,
      organizationName: "Example Co",
      jobTitle: "Engineer",
      startsAt: "2026-11-15T10:00:00.000Z",
      meetingUrl: "https://meet.example.test/room",
      location: null,
    },
  ]);
  service.whatsappDelivery.isReady = async () => true;
  const inserted = [];
  service.dataSource.query = async (sql, params) => {
    if (sql.includes("FROM employer_interviews")) {
      return [
        {
          id: 21,
          userId: 42,
          candidatePhone: "+15551112222",
          phoneVerified: true,
          whatsappOptIn: true,
          emailNeedsSend: false,
          organizationName: "Example Co",
          jobTitle: "Engineer",
          startsAt: "2026-11-15T10:00:00.000Z",
          meetingUrl: "https://meet.example.test/room",
          location: null,
        },
      ];
    }
    if (sql.includes("INSERT INTO whatsapp_notification_outbox")) {
      inserted.push({ sql, params });
      return [{ id: 1 }];
    }
    if (sql.includes("WITH next_batch")) return [];
    return [];
  };

  assert.equal(await service.enqueueUpcomingReminders(), 1);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].params[0], 42);
  assert.equal(inserted[0].params[2], "+15551112222");
  assert.deepEqual(JSON.parse(inserted[0].params[3]), {
    1: "Engineer",
    2: "Example Co",
    3: new Date("2026-11-15T10:00:00.000Z").toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    }),
    4: "https://meet.example.test/room",
  });
});

test("WhatsApp outbox sends once and clears recipient data after delivery", async () => {
  const service = createService([
    {
      id: 21,
      userId: 42,
      candidatePhone: "+15551112222",
      phoneVerified: true,
      whatsappOptIn: true,
      emailNeedsSend: false,
      organizationName: "Example Co",
      jobTitle: "Engineer",
      startsAt: "2026-11-15T10:00:00.000Z",
      meetingUrl: null,
      location: null,
    },
  ]);
  service.whatsappDelivery.isReady = async () => true;
  const delivered = [];
  const queries = [];
  service.whatsappDelivery.sendInterviewReminder = async (...args) =>
    delivered.push(args);
  service.dataSource.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("FROM employer_interviews")) {
      return [
        {
          id: 21,
          userId: 42,
          candidatePhone: "+15551112222",
          phoneVerified: true,
          whatsappOptIn: true,
          emailNeedsSend: false,
          organizationName: "Example Co",
          jobTitle: "Engineer",
          startsAt: "2026-11-15T10:00:00.000Z",
          meetingUrl: null,
          location: null,
        },
      ];
    }
    if (sql.includes("INSERT INTO whatsapp_notification_outbox"))
      return [{ id: 1 }];
    if (sql.includes("WITH next_batch"))
      return [
        {
          id: 1,
          toNumber: "+15551112222",
          templateVariables: { 1: "Engineer" },
          attemptCount: 1,
        },
      ];
    return [];
  };

  assert.equal(await service.enqueueUpcomingReminders(), 1);
  assert.deepEqual(delivered, [["+15551112222", { 1: "Engineer" }]]);
  assert.ok(
    queries.some(
      ({ sql }) =>
        sql.includes("SET status = 'sent'") && sql.includes("to_number = NULL"),
    ),
  );
});

test("overlapping interview reminder scans do not run concurrently", async () => {
  let releaseQuery;
  const service = createService([]);
  let firstScanQuery = true;
  service.dataSource.query = (sql) => {
    if (sql.includes("FROM employer_interviews") && firstScanQuery) {
      firstScanQuery = false;
      return new Promise((resolve) => {
        releaseQuery = () => resolve([]);
      });
    }
    return Promise.resolve([]);
  };

  const firstScan = service.enqueueUpcomingReminders();
  await Promise.resolve();
  assert.equal(await service.enqueueUpcomingReminders(), 0);
  releaseQuery();
  assert.equal(await firstScan, 0);
});
