const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  AdminInsightsService,
} = require("../dist/admin/admin-insights.service.js");

test("admin payment reconciliation combines recent paid ledgers without losing paise precision", async () => {
  const service = Object.create(AdminInsightsService.prototype);
  service.candidatePayments = {
    find: async (options) => {
      assert.deepEqual(options.where, { paymentStatus: "paid" });
      assert.equal(options.take, 500);
      return [
        {
          razorpayPaymentId: "pay_candidate",
          razorpayOrderId: "order_candidate",
          amountPaise: 12345,
          currency: "INR",
          paidAt: new Date("2026-11-02T10:00:00.000Z"),
        },
      ];
    },
  };
  service.employerPayments = {
    find: async () => [
      {
        razorpayPaymentId: "pay_employer",
        subscriptionId: "sub_employer",
        invoiceId: "inv_123",
        amountPaise: "9007199254740991",
        currency: "INR",
        paidAt: new Date("2026-11-03T10:00:00.000Z"),
      },
    ],
  };

  const result = await service.paymentReconciliation();

  assert.equal(result.limit, 500);
  assert.deepEqual(result.items, [
    {
      source: "employer_subscription",
      gatewayPaymentId: "pay_employer",
      gatewayReferenceId: "sub_employer",
      invoiceId: "inv_123",
      amount: "90071992547409.91",
      currency: "INR",
      status: "captured",
      paidAt: "2026-11-03T10:00:00.000Z",
    },
    {
      source: "candidate_service",
      gatewayPaymentId: "pay_candidate",
      gatewayReferenceId: "order_candidate",
      invoiceId: null,
      amount: "123.45",
      currency: "INR",
      status: "captured",
      paidAt: "2026-11-02T10:00:00.000Z",
    },
  ]);
});
