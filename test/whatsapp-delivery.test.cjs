const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ServiceUnavailableException } = require("@nestjs/common");
const {
  WhatsAppDeliveryService,
} = require("../dist/providers/whatsapp-delivery.service.js");

test("WhatsApp interview reminder uses the configured Twilio content template", async () => {
  const service = new WhatsAppDeliveryService({
    whatsappCredentials: async () => ({
      accountSid: "ACtest",
      authToken: "server-secret",
      from: "whatsapp:+15550000000",
      templateSid: `HX${"b".repeat(32)}`,
    }),
  });
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (...args) => {
    request = args;
    return { ok: true };
  };
  try {
    await service.sendInterviewReminder("+15551112222", {
      1: "Engineer",
      2: "Example Co",
      3: "Nov 15, 2026",
      4: "See your portal",
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(request[0], /Accounts\/ACtest\/Messages\.json$/);
  const body = new URLSearchParams(request[1].body);
  assert.equal(body.get("To"), "whatsapp:+15551112222");
  assert.equal(body.get("From"), "whatsapp:+15550000000");
  assert.equal(body.get("ContentSid"), `HX${"b".repeat(32)}`);
  assert.deepEqual(JSON.parse(body.get("ContentVariables")), {
    1: "Engineer",
    2: "Example Co",
    3: "Nov 15, 2026",
    4: "See your portal",
  });
  assert.match(request[1].headers.Authorization, /^Basic /);
});

test("WhatsApp delivery reports provider failures without exposing response bodies", async () => {
  const service = new WhatsAppDeliveryService({
    whatsappCredentials: async () => ({
      accountSid: "ACtest",
      authToken: "server-secret",
      from: "whatsapp:+15550000000",
      templateSid: `HX${"b".repeat(32)}`,
    }),
  });
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => "sensitive provider response",
  });
  try {
    await assert.rejects(
      service.sendInterviewReminder("+15551112222", { 1: "Engineer" }),
      (error) =>
        error instanceof ServiceUnavailableException &&
        error.message.includes("HTTP 400") &&
        !error.message.includes("sensitive provider response"),
    );
  } finally {
    global.fetch = originalFetch;
  }
});
