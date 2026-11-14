const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  NotificationTemplatesService,
} = require("../dist/notifications/notification-templates.service.js");

test("email templates interpolate only the selected template values", async () => {
  const service = Object.create(NotificationTemplatesService.prototype);
  service.dataSource = {
    query: async () => [
      {
        subject: "Application update: {{jobTitle}}",
        body: "Your application at {{company}} changed.",
      },
    ],
  };

  assert.deepEqual(
    await service.render("application_status", {
      jobTitle: "Engineer",
      company: "Example",
      status: "interview",
    }),
    {
      subject: "Application update: Engineer",
      body: "Your application at Example changed.",
    },
  );
});

test("email template updates validate placeholders and record audited changes", async () => {
  const service = Object.create(NotificationTemplatesService.prototype);
  const updates = [];
  const auditEvents = [];
  service.dataSource = {
    transaction: async (callback) =>
      callback({
        query: async (_sql, parameters) => {
          updates.push(parameters);
          return [
            {
              key: parameters[0],
              subject: parameters[1],
              body: parameters[2],
              customized: true,
              updatedAt: new Date(),
            },
          ];
        },
      }),
  };
  service.auditService = {
    record: async (event) => auditEvents.push(event),
  };
  const actor = { id: 9 };

  await assert.rejects(
    service.update(
      "login_code",
      "Your code",
      "Use {{unexpected}}",
      "Review copy",
      actor,
    ),
    /Unsupported placeholder/,
  );
  assert.equal(updates.length, 0);

  const updated = await service.update(
    "login_code",
    "Sign-in {{code}}",
    "Your one-time code is {{code}}.",
    "Updated sign-in instructions",
    actor,
  );
  assert.equal(updated.customized, true);
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].action, "notification_template.updated");
  assert.deepEqual(updates[0], [
    "login_code",
    "Sign-in {{code}}",
    "Your one-time code is {{code}}.",
    actor.id,
  ]);
});
