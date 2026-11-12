const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  RazorpayConfigurationService,
} = require("../dist/payments/razorpay-configuration.service.js");

test("Razorpay settings encrypt secrets, mask them in admin views, and honor disablement", async () => {
  const previousEnvironment = {
    encryptionKey: process.env.RAZORPAY_CONFIG_ENCRYPTION_KEY,
    keyId: process.env.RAZORPAY_KEY_ID,
    apiSecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  };
  process.env.RAZORPAY_CONFIG_ENCRYPTION_KEY =
    "test-encryption-key-with-at-least-32-characters";
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;

  let storedConfiguration;
  const configurations = {
    findOne: async () => storedConfiguration ?? null,
    findOneBy: async () => storedConfiguration ?? null,
    create: (value) => ({ ...value }),
    save: async (value) => {
      storedConfiguration = { ...value };
      return storedConfiguration;
    },
  };
  const service = new RazorpayConfigurationService(configurations, {
    record: async () => undefined,
  });

  try {
    await service.update(
      {
        enabled: true,
        keyId: "rzp_test_key",
        apiSecret: "private-api-secret",
        webhookSecret: "private-webhook-secret",
        starterPlanId: "plan_starter",
        starterAmountInr: 2999,
        starterActiveJobs: 5,
        starterSeats: 3,
        starterResumeCredits: 0,
        growthPlanId: "plan_growth",
        growthAmountInr: 9999,
        growthActiveJobs: 25,
        growthSeats: 10,
        growthResumeCredits: 25,
        businessPlanId: "plan_business",
        businessAmountInr: 24999,
        businessActiveJobs: 75,
        businessSeats: 25,
        businessResumeCredits: 100,
        enterprisePlanId: "plan_enterprise",
        enterpriseAmountInr: 49999,
        enterpriseActiveJobs: 250,
        enterpriseSeats: 50,
        enterpriseResumeCredits: 500,
      },
      { id: 1 },
    );

    assert.notEqual(
      storedConfiguration.apiSecretEncrypted,
      "private-api-secret",
    );
    assert.notEqual(
      storedConfiguration.webhookSecretEncrypted,
      "private-webhook-secret",
    );
    assert.equal(
      storedConfiguration.apiSecretEncrypted.includes("private-api-secret"),
      false,
    );
    assert.equal(
      storedConfiguration.webhookSecretEncrypted.includes(
        "private-webhook-secret",
      ),
      false,
    );

    const adminView = await service.adminView();
    assert.equal(adminView.apiSecretConfigured, true);
    assert.equal(adminView.webhookSecretConfigured, true);
    assert.equal(adminView.keyId, "rzp_test_key");
    assert.equal(adminView.starterAmountInr, 2999);
    assert.equal(adminView.starterActiveJobs, 5);
    assert.equal(adminView.growthAmountInr, 9999);
    assert.equal(adminView.businessActiveJobs, 75);
    assert.equal(adminView.enterpriseSeats, 50);
    assert.equal(adminView.businessResumeCredits, 100);
    assert.equal("apiSecret" in adminView, false);
    assert.equal("webhookSecret" in adminView, false);

    assert.deepEqual(await service.credentials(), {
      keyId: "rzp_test_key",
      apiSecret: "private-api-secret",
      webhookSecret: "private-webhook-secret",
      enabled: true,
    });

    const plans = await service.employerPlans();
    assert.deepEqual(plans.business, {
      planId: "plan_business",
      amountInr: 24999,
      activeJobs: 75,
      seats: 25,
      resumeCredits: 100,
    });

    const encryptedApiSecret = storedConfiguration.apiSecretEncrypted;
    await service.update({ enabled: false }, { id: 1 });
    assert.equal(storedConfiguration.apiSecretEncrypted, encryptedApiSecret);
    assert.equal((await service.credentials()).enabled, false);
  } finally {
    for (const [name, value] of [
      ["RAZORPAY_CONFIG_ENCRYPTION_KEY", previousEnvironment.encryptionKey],
      ["RAZORPAY_KEY_ID", previousEnvironment.keyId],
      ["RAZORPAY_KEY_SECRET", previousEnvironment.apiSecret],
      ["RAZORPAY_WEBHOOK_SECRET", previousEnvironment.webhookSecret],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
