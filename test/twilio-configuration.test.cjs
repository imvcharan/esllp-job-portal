const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ServiceUnavailableException } = require("@nestjs/common");
const {
  TwilioConfigurationService,
} = require("../dist/providers/twilio-configuration.service.js");

const environmentKeys = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "TWILIO_WHATSAPP_FROM",
  "TWILIO_WHATSAPP_TEMPLATE_SID",
  "TWILIO_CONFIG_ENCRYPTION_KEY",
];

async function withEnvironment(values, callback) {
  const previous = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await callback();
  } finally {
    for (const key of environmentKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function createService(initialConfiguration = null) {
  let configuration = initialConfiguration;
  const auditEvents = [];
  const repository = {
    findOne: async () => configuration,
    findOneBy: async () => configuration,
    create: (value) => ({ ...value }),
    save: async (value) => {
      configuration = value;
      return value;
    },
  };
  const service = new TwilioConfigurationService(repository, {
    record: async (event) => auditEvents.push(event),
  });
  return { service, auditEvents, getConfiguration: () => configuration };
}

test("Twilio admin view uses environment fallback without exposing the token", async () => {
  await withEnvironment(
    {
      TWILIO_ACCOUNT_SID: "ACtest",
      TWILIO_AUTH_TOKEN: "env-secret-token",
      TWILIO_FROM_NUMBER: "+15551234567",
      TWILIO_CONFIG_ENCRYPTION_KEY: "k".repeat(32),
    },
    async () => {
      const { service } = createService();
      const view = await service.adminView();
      assert.equal(view.enabled, true);
      assert.equal(view.ready, true);
      assert.equal(view.accountSid, "ACtest");
      assert.equal(view.authTokenConfigured, true);
      assert.equal(JSON.stringify(view).includes("env-secret-token"), false);
      assert.equal((await service.credentials()).authToken, "env-secret-token");
    },
  );
});

test("Twilio updates encrypt secrets, audit changes, and honor disablement", async () => {
  await withEnvironment(
    {
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_FROM_NUMBER: undefined,
      TWILIO_CONFIG_ENCRYPTION_KEY: "k".repeat(32),
    },
    async () => {
      const { service, auditEvents, getConfiguration } = createService();
      const view = await service.update(
        {
          enabled: true,
          accountSid: "ACtest",
          authToken: "saved-secret-token",
          fromNumber: "+15551234567",
          reason: "Configure SMS provider",
        },
        { id: 7 },
      );
      assert.equal(view.ready, true);
      assert.equal(view.authTokenConfigured, true);
      assert.equal(JSON.stringify(view).includes("saved-secret-token"), false);
      assert.notEqual(
        getConfiguration().authTokenEncrypted,
        "saved-secret-token",
      );
      assert.equal(
        (await service.credentials()).authToken,
        "saved-secret-token",
      );
      assert.equal(auditEvents.length, 1);
      assert.equal(
        JSON.stringify(auditEvents[0]).includes("saved-secret-token"),
        false,
      );
      await service.update(
        {
          enabled: false,
          reason: "Disable SMS provider",
        },
        { id: 7 },
      );
      await assert.rejects(service.credentials(), ServiceUnavailableException);
    },
  );
});

test("Twilio cannot save a credential without an encryption key", async () => {
  await withEnvironment(
    {
      TWILIO_CONFIG_ENCRYPTION_KEY: undefined,
    },
    async () => {
      const { service } = createService();
      await assert.rejects(
        service.update(
          {
            enabled: true,
            authToken: "secret",
            reason: "Configure SMS provider",
          },
          { id: 7 },
        ),
        ServiceUnavailableException,
      );
    },
  );
});

test("WhatsApp interview reminders stay disabled until a sender and approved template are configured", async () => {
  await withEnvironment(
    {
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_FROM_NUMBER: undefined,
      TWILIO_WHATSAPP_FROM: undefined,
      TWILIO_WHATSAPP_TEMPLATE_SID: undefined,
      TWILIO_CONFIG_ENCRYPTION_KEY: "k".repeat(32),
    },
    async () => {
      const { service } = createService();
      assert.equal((await service.adminView()).whatsappEnabled, false);
      assert.equal((await service.adminView()).whatsappReady, false);

      const view = await service.update(
        {
          enabled: false,
          accountSid: "ACtest",
          authToken: "saved-secret-token",
          whatsappEnabled: true,
          whatsappFrom: "whatsapp:+15551234567",
          whatsappTemplateSid: `HX${"a".repeat(32)}`,
          reason: "Enable opted-in interview reminders",
        },
        { id: 7 },
      );

      assert.equal(view.whatsappReady, true);
      assert.equal(JSON.stringify(view).includes("saved-secret-token"), false);
      assert.deepEqual(await service.whatsappCredentials(), {
        accountSid: "ACtest",
        authToken: "saved-secret-token",
        from: "whatsapp:+15551234567",
        templateSid: `HX${"a".repeat(32)}`,
      });
    },
  );
});
