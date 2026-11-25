const assert = require("node:assert/strict");
const { test } = require("node:test");
const { NotFoundException } = require("@nestjs/common");
const { EmployersService } = require("../dist/employers/employers.service.js");

function createService({ invoice = "inv_123" } = {}) {
  const audits = [];
  let providerCalls = 0;
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization: { id: 21 },
    membership: { role: "owner" },
  });
  service.requireRole = () => undefined;
  service.dataSource = {
    query: async (sql, parameters) => {
      assert.match(sql, /organization_id = \$2/);
      assert.deepEqual(parameters, [8, 21]);
      return invoice ? [{ invoiceId: invoice }] : [];
    },
  };
  service.razorpayRequest = async () => {
    providerCalls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "inv_123",
        short_url: "https://rzp.io/i/inv_123",
      }),
    };
  };
  service.auditService = {
    record: async (event) => audits.push(event),
  };
  return { service, audits, getProviderCalls: () => providerCalls };
}

test("company billing roles can access only their provider-issued invoice URL", async () => {
  const { service, audits, getProviderCalls } = createService();
  const result = await service.subscriptionInvoiceUrl({ id: 4 }, 8);

  assert.deepEqual(result, { invoiceUrl: "https://rzp.io/i/inv_123" });
  assert.equal(getProviderCalls(), 1);
  assert.equal(audits[0].action, "employer.subscription_invoice_accessed");
});

test("invoice access fails closed when the payment has no invoice", async () => {
  const { service, audits, getProviderCalls } = createService({
    invoice: null,
  });

  await assert.rejects(
    service.subscriptionInvoiceUrl({ id: 4 }, 8),
    NotFoundException,
  );
  assert.equal(getProviderCalls(), 0);
  assert.equal(audits.length, 0);
});
