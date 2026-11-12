const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EmployersService } = require("../dist/employers/employers.service.js");

test("employer plan catalog exposes configured tier prices and quotas", async () => {
  const service = Object.create(EmployersService.prototype);
  service.razorpayConfiguration = {
    employerPlans: async () => ({
      starter: {
        planId: "plan_starter",
        amountInr: 2999,
        activeJobs: 5,
        seats: 3,
        resumeCredits: 0,
      },
      growth: {
        planId: "plan_growth",
        amountInr: 9999,
        activeJobs: 25,
        seats: 10,
        resumeCredits: 25,
      },
      business: {
        planId: "plan_business",
        amountInr: 24999,
        activeJobs: 75,
        seats: 25,
        resumeCredits: 100,
      },
      enterprise: {
        planId: "plan_enterprise",
        amountInr: 50000,
        activeJobs: 250,
        seats: 50,
        resumeCredits: 500,
      },
    }),
  };

  const plans = await service.planCatalog();
  assert.deepEqual(
    plans.map(({ key, amountInr, activeJobs, seats, resumeCredits }) => ({
      key,
      amountInr,
      activeJobs,
      seats,
      resumeCredits,
    })),
    [
      {
        key: "free",
        amountInr: 0,
        activeJobs: 1,
        seats: 1,
        resumeCredits: 0,
      },
      {
        key: "starter",
        amountInr: 2999,
        activeJobs: 5,
        seats: 3,
        resumeCredits: 0,
      },
      {
        key: "growth",
        amountInr: 9999,
        activeJobs: 25,
        seats: 10,
        resumeCredits: 25,
      },
      {
        key: "business",
        amountInr: 24999,
        activeJobs: 75,
        seats: 25,
        resumeCredits: 100,
      },
      {
        key: "enterprise",
        amountInr: 50000,
        activeJobs: 250,
        seats: 50,
        resumeCredits: 500,
      },
    ],
  );
});

test("employer entitlements use configured active paid-plan quotas", async () => {
  const service = Object.create(EmployersService.prototype);
  service.razorpayConfiguration = {
    employerPlans: async () => ({
      business: { activeJobs: 75, seats: 25, resumeCredits: 100 },
    }),
  };

  assert.deepEqual(
    await service.limitsFor({
      planKey: "free",
      subscriptionStatus: "free",
    }),
    { activeJobs: 1, seats: 1, resumeCredits: 0 },
  );
  assert.deepEqual(
    await service.limitsFor({
      planKey: "business",
      subscriptionStatus: "active",
    }),
    { activeJobs: 75, seats: 25, resumeCredits: 100 },
  );
  assert.deepEqual(
    await service.limitsFor({
      planKey: "business",
      subscriptionStatus: "past_due",
    }),
    { activeJobs: 1, seats: 1, resumeCredits: 0 },
  );
});
