const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  EmailDeliveryService,
} = require("../dist/auth/email-delivery.service.js");

function createService() {
  const service = Object.create(EmailDeliveryService.prototype);
  service.processing = false;
  service.logger = { error: () => undefined };
  service.queries = [];
  service.dataSource = {
    query: async (sql, parameters = []) => {
      service.queries.push({ sql, parameters });
      if (sql.includes("RETURNING id")) return [{ id: 8 }];
      return [];
    },
    transaction: async (callback) =>
      callback({
        query: async (sql, parameters) => {
          service.queries.push({ sql, parameters });
          return service.claimed ?? [];
        },
      }),
  };
  return service;
}

test("notification outbox enqueue uses a stable deduplication key", async () => {
  const service = createService();
  const result = await service.sendNotification(
    "candidate@example.test",
    "Application update",
    "Your application changed.",
    "application-status:42:91",
  );

  assert.equal(result, "queued");
  assert.match(
    service.queries[0].sql,
    /ON CONFLICT \(deduplication_key\) DO NOTHING/,
  );
  assert.equal(service.queries[0].parameters[0], "application-status:42:91");
});

test("outbox worker clears delivery content after successful email delivery", async () => {
  const service = createService();
  service.claimed = [
    {
      id: 12,
      recipientEmail: "candidate@example.test",
      subject: "Application update",
      message: "Your application changed.",
      attempts: 1,
    },
  ];
  service.send = async () => undefined;

  assert.equal(await service.processPendingNotifications(), 1);
  const completion = service.queries.find((entry) =>
    entry.sql.includes("SET status = 'sent'"),
  );
  assert.ok(completion);
  assert.match(completion.sql, /recipient_email = NULL/);
  assert.match(completion.sql, /message = NULL/);
});

test("outbox worker schedules bounded retries and eventually marks delivery failed", async () => {
  const service = createService();
  service.claimed = [
    {
      id: 13,
      recipientEmail: "candidate@example.test",
      subject: "Application update",
      message: "Your application changed.",
      attempts: 5,
    },
  ];
  service.send = async () => {
    throw new Error("SMTP unavailable");
  };

  await service.processPendingNotifications();
  const update = service.queries.find((entry) =>
    entry.sql.includes("SET status = $2"),
  );
  assert.equal(update.parameters[1], "failed");
  assert.equal(update.parameters[2], 960);
});

test("admin retry only requeues failed deliveries with retained content", async () => {
  const service = createService();
  assert.equal(await service.retryFailedNotification(8), true);
  assert.match(service.queries[0].sql, /status = 'failed'/);
  assert.match(service.queries[0].sql, /recipient_email IS NOT NULL/);
});

test("failed notification payloads and errors are cleared after 30 days", async () => {
  const service = createService();
  service.dataSource.query = async (sql) => {
    service.queries.push({ sql, parameters: [] });
    return [{ id: 17 }];
  };

  assert.equal(await service.purgeExpiredFailedNotifications(), 1);
  assert.match(service.queries[0].sql, /status = 'failed'/);
  assert.match(
    service.queries[0].sql,
    /failed_at < now\(\) - INTERVAL '30 days'/,
  );
  assert.match(service.queries[0].sql, /recipient_email = NULL/);
  assert.match(service.queries[0].sql, /last_error = NULL/);
});
