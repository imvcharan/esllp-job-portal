const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ServiceUnavailableException } = require("@nestjs/common");
const { SmsDeliveryService } = require("../dist/auth/sms-delivery.service.js");

function deliveryWith(credentials) {
  return new SmsDeliveryService({ credentials });
}

const credentials = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
];

function withTwilioCredentials(values, callback) {
  const previous = Object.fromEntries(
    credentials.map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const key of credentials) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    });
}

test("SMS delivery fails explicitly when Twilio is not configured", async () => {
  await withTwilioCredentials(
    {
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_FROM_NUMBER: undefined,
    },
    async () => {
      const delivery = deliveryWith(async () => {
        throw new ServiceUnavailableException("Not configured");
      });
      await assert.rejects(delivery.assertConfigured(), ServiceUnavailableException);
      await assert.rejects(
        delivery.sendVerificationCode("+919876543210", "123456"),
        ServiceUnavailableException,
      );
    },
  );
});

test("SMS delivery posts the OTP only to Twilio over the server-side API", async () => {
  await withTwilioCredentials(
    {
      TWILIO_ACCOUNT_SID: "AC123456789",
      TWILIO_AUTH_TOKEN: "test-secret",
      TWILIO_FROM_NUMBER: "+15551234567",
    },
    async () => {
      const originalFetch = global.fetch;
      let request;
      global.fetch = async (url, init) => {
        request = { url, init };
        return { ok: true, status: 201 };
      };
      try {
        await deliveryWith(async () => ({
          accountSid: "AC123456789",
          authToken: "test-secret",
          fromNumber: "+15551234567",
        })).sendVerificationCode(
          "+919876543210",
          "123456",
        );
        assert.match(request.url, /^https:\/\/api\.twilio\.com\//);
        assert.equal(request.init.method, "POST");
        assert.match(request.init.headers.Authorization, /^Basic /);
        const form = new URLSearchParams(request.init.body);
        assert.equal(form.get("To"), "+919876543210");
        assert.equal(form.get("From"), "+15551234567");
        assert.match(form.get("Body"), /123456/);
      } finally {
        global.fetch = originalFetch;
      }
    },
  );
});

test("SMS delivery reports provider failures without leaking provider response bodies", async () => {
  await withTwilioCredentials(
    {
      TWILIO_ACCOUNT_SID: "AC123456789",
      TWILIO_AUTH_TOKEN: "test-secret",
      TWILIO_FROM_NUMBER: "+15551234567",
    },
    async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: false,
        status: 400,
        text: async () => "sensitive provider details",
      });
      try {
        await assert.rejects(
          deliveryWith(async () => ({
            accountSid: "AC123456789",
            authToken: "test-secret",
            fromNumber: "+15551234567",
          })).sendVerificationCode(
            "+919876543210",
            "123456",
          ),
          (error) => {
            assert.ok(error instanceof ServiceUnavailableException);
            assert.doesNotMatch(error.message, /sensitive provider details/);
            return true;
          },
        );
      } finally {
        global.fetch = originalFetch;
      }
    },
  );
});
