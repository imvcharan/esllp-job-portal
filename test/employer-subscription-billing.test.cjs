const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { test } = require("node:test");
const {
  AdminInsightsService,
} = require("../dist/admin/admin-insights.service.js");
const {
  EmployerOrganization,
} = require("../dist/employers/organization.entity.js");
const {
  EmployersService,
} = require("../dist/employers/employers.service.js");
const { Job } = require("../dist/jobs/job.entity.js");

function createWebhookService(body, options = {}) {
  const paymentInserts = [];
  const organization = {
    id: 21,
    pendingRazorpaySubscriptionId: null,
    pendingPlanKey: null,
    razorpaySubscriptionId: "sub_123",
    planKey: "starter",
    subscriptionStatus: "active",
    subscriptionCurrentPeriodEnd: null,
  };
  let eventSeen = false;
  const manager = {
    query: async (sql, parameters) => {
      if (sql.includes("INSERT INTO razorpay_webhook_events")) {
        if (eventSeen || options.duplicate) return [];
        eventSeen = true;
        return [{ event_id: parameters[0] }];
      }
      if (sql.includes("INSERT INTO employer_subscription_payments")) {
        paymentInserts.push(parameters);
        return [];
      }
      throw new Error("Unexpected SQL query");
    },
    getRepository: (entity) => {
      if (entity === EmployerOrganization)
        return {
          findOne: async () => options.unlinked ? null : organization,
          save: async (value) => value,
        };
      if (entity === Job) return {};
      throw new Error("Unexpected repository");
    },
  };
  const service = Object.create(EmployersService.prototype);
  Object.assign(service, {
    dataSource: { transaction: (callback) => callback(manager) },
    razorpayConfiguration: {
      credentials: async () => ({ webhookSecret: "webhook-secret" }),
    },
    logger: { error: () => undefined },
    enforceJobQuota: async () => undefined,
  });
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = createHmac("sha256", "webhook-secret")
    .update(rawBody)
    .digest("hex");
  return {
    paymentInserts,
    service,
    rawBody,
    signature,
    organization,
  };
}

function chargeEvent(overrides = {}) {
  return {
    event: "subscription.charged",
    payload: {
      subscription: {
        entity: { id: "sub_123", current_end: 1_800_000_000 },
      },
      payment: {
        entity: {
          id: "pay_456",
          status: "captured",
          amount: 299900,
          currency: "INR",
          invoice_id: "inv_789",
          created_at: 1_790_000_000,
          ...overrides,
        },
      },
    },
  };
}

test("employer subscription charged webhooks persist the captured payment once", async () => {
  const fixture = createWebhookService(chargeEvent());

  const first = await fixture.service.handleRazorpayWebhook(
    fixture.rawBody,
    fixture.signature,
    "event_123",
    chargeEvent(),
  );
  const repeated = await fixture.service.handleRazorpayWebhook(
    fixture.rawBody,
    fixture.signature,
    "event_123",
    chargeEvent(),
  );

  assert.deepEqual(first, { received: true });
  assert.deepEqual(repeated, { received: true, duplicate: true });
  assert.equal(fixture.paymentInserts.length, 1);
  assert.deepEqual(fixture.paymentInserts[0].slice(0, 7), [
    21,
    "sub_123",
    "pay_456",
    "inv_789",
    "starter",
    "299900",
    "INR",
  ]);
  assert.equal(
    fixture.paymentInserts[0][7].toISOString(),
    new Date(1_790_000_000 * 1000).toISOString(),
  );
});

test("employer subscription charges reject malformed or unlinked payments", async () => {
  const malformed = createWebhookService(chargeEvent({ status: "authorized" }));
  await assert.rejects(
    malformed.service.handleRazorpayWebhook(
      malformed.rawBody,
      malformed.signature,
      "event_bad",
      chargeEvent({ status: "authorized" }),
    ),
    (error) => error.getStatus() === 400,
  );
  assert.equal(malformed.paymentInserts.length, 0);

  const unlinked = createWebhookService(chargeEvent(), { unlinked: true });
  await assert.rejects(
    unlinked.service.handleRazorpayWebhook(
      unlinked.rawBody,
      unlinked.signature,
      "event_unlinked",
      chargeEvent(),
    ),
    (error) => error.getStatus() === 503,
  );
  assert.equal(unlinked.paymentInserts.length, 0);
});

test("employer revenue analytics returns captured totals grouped by currency", async () => {
  const calls = [];
  const results = [
    [{ currency: "INR", paidOrders: "2", grossAmount: "5998.00" }],
    [{
      currency: "INR",
      month: "2026-11",
      paidOrders: "2",
      grossAmount: "5998.00",
    }],
    [{
      planKey: "starter",
      currency: "INR",
      paidOrders: "2",
      grossAmount: "5998.00",
    }],
  ];
  const service = Object.create(AdminInsightsService.prototype);
  service.employerPayments = {
    createQueryBuilder: () => {
      const query = {
        select: (...args) => { calls.push(["select", ...args]); return query; },
        addSelect: (...args) => { calls.push(["addSelect", ...args]); return query; },
        where: (...args) => { calls.push(["where", ...args]); return query; },
        groupBy: (...args) => { calls.push(["groupBy", ...args]); return query; },
        addGroupBy: (...args) => { calls.push(["addGroupBy", ...args]); return query; },
        orderBy: (...args) => { calls.push(["orderBy", ...args]); return query; },
        addOrderBy: (...args) => { calls.push(["addOrderBy", ...args]); return query; },
        getRawMany: async () => results.shift(),
      };
      return query;
    },
  };

  const revenue = await service.employerSubscriptionRevenue();

  assert.equal(revenue.scope, "employer_subscription_charges");
  assert.deepEqual(revenue.totalsByCurrency, [
    { currency: "INR", paidOrders: "2", grossAmount: "5998.00" },
  ]);
  assert.deepEqual(revenue.monthly, [{
    currency: "INR",
    month: "2026-11",
    paidOrders: "2",
    grossAmount: "5998.00",
  }]);
  assert.deepEqual(revenue.byPlan, [{
    planKey: "starter",
    currency: "INR",
    paidOrders: "2",
    grossAmount: "5998.00",
  }]);
  assert.ok(calls.some(([, expression]) =>
    String(expression).includes("INTERVAL '11 months'")));
});
