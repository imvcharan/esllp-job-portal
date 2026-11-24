const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CommercialControlsService,
} = require("../dist/payments/commercial-controls.service.js");

function createService({ payment, refundedAmountPaise = "0" }) {
  const statements = [];
  const audits = [];
  const savedRefunds = [];
  const manager = {
    query: async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (sql.includes("FROM payment_refunds")) {
        return [{ refundedAmountPaise }];
      }
      return payment ? [payment] : [];
    },
    create: (_entity, values) => values,
    save: async (refund) => {
      savedRefunds.push(refund);
      return { id: 21, ...refund };
    },
  };
  const dataSource = {
    transaction: async (callback) => callback(manager),
  };
  const service = new CommercialControlsService(
    {},
    { find: async () => [], save: async (value) => value },
    { record: async (event) => audits.push(event) },
    dataSource,
  );
  return { service, statements, audits, savedRefunds };
}

const request = {
  paymentSource: "candidate",
  paymentReference: " order_1 ",
  amountPaise: 2500,
  reason: "  Duplicate charge  ",
};

test("refund creation validates the captured payment and canonicalizes its reference", async () => {
  const { service, audits, savedRefunds } = createService({
    payment: { paymentReference: "pay_1", amountPaise: "10000" },
    refundedAmountPaise: "5000",
  });

  const refund = await service.createRefund(request, { id: 4 });

  assert.equal(refund.paymentReference, "pay_1");
  assert.equal(refund.reason, "Duplicate charge");
  assert.equal(savedRefunds.length, 1);
  assert.equal(audits[0].action, "payment.refund_requested");
});

test("employer refunds validate against captured subscription payments", async () => {
  const { service, statements, savedRefunds } = createService({
    payment: { paymentReference: "pay_employer_1", amountPaise: "10000" },
  });

  await service.createRefund(
    {
      ...request,
      paymentSource: "employer",
      paymentReference: "pay_employer_1",
    },
    { id: 4 },
  );

  assert.match(statements[0].sql, /FROM employer_subscription_payments/);
  assert.equal(savedRefunds[0].paymentReference, "pay_employer_1");
});

test("refund creation rejects unknown payments and amounts above the remaining balance", async () => {
  const missingPayment = createService({ payment: null });
  await assert.rejects(
    missingPayment.service.createRefund(request, { id: 4 }),
    /captured payment/,
  );

  const overRefund = createService({
    payment: { paymentReference: "pay_1", amountPaise: "10000" },
    refundedAmountPaise: "9000",
  });
  await assert.rejects(
    overRefund.service.createRefund(request, { id: 4 }),
    /remaining captured payment balance/,
  );
  assert.equal(overRefund.savedRefunds.length, 0);
});
