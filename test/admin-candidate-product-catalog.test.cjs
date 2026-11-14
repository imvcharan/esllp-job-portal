const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidatePremiumService,
} = require("../dist/users/candidate-premium.service.js");

function createCatalogService(initial = []) {
  const productsByKey = new Map(
    initial.map((product) => [product.key, product]),
  );
  const audits = [];
  const products = {
    findOneBy: async ({ key }) => productsByKey.get(key) || null,
    find: async () => [...productsByKey.values()],
    create: (product) => ({ ...product }),
    save: async (product) => {
      productsByKey.set(product.key, product);
      return product;
    },
  };
  const service = Object.create(CandidatePremiumService.prototype);
  Object.assign(service, {
    products,
    audit: { record: async (event) => audits.push(event) },
  });
  return { service, productsByKey, audits };
}

test("superadmin can create and rename a candidate service with an audited price", async () => {
  const { service, productsByKey, audits } = createCatalogService();
  const actor = { id: 8 };
  const created = await service.createProduct(
    {
      key: "interview-coaching",
      name: " Interview coaching ",
      description: "A private coaching session.",
      amountInr: 750.5,
      enabled: true,
    },
    actor,
  );

  assert.equal(created.name, "Interview coaching");
  assert.equal(created.amountInr, 750.5);
  assert.equal(productsByKey.get("interview-coaching").amountPaise, 75050);
  assert.equal(audits[0].action, "admin.candidate_premium_product_created");

  const updated = await service.updateProduct(
    "interview-coaching",
    {
      name: "Interview preparation",
      description: "Updated service details.",
      amountInr: 900,
    },
    actor,
  );
  assert.equal(updated.name, "Interview preparation");
  assert.equal(updated.amountInr, 900);
  assert.equal(audits[1].action, "admin.candidate_premium_product_updated");
});

test("deleting a candidate service disables checkout and preserves the catalog record", async () => {
  const product = {
    key: "resume-review",
    name: "Resume review",
    description: "Review.",
    amountPaise: 49900,
    fulfillmentDays: 0,
    enabled: true,
  };
  const { service, productsByKey, audits } = createCatalogService([product]);
  const removed = await service.disableProduct(
    "resume-review",
    "Retiring this service",
    { id: 8 },
  );

  assert.equal(removed.enabled, false);
  assert.equal(productsByKey.get("resume-review"), product);
  assert.equal(audits[0].action, "admin.candidate_premium_product_disabled");
  assert.equal(audits[0].details.reason, "Retiring this service");
  assert.equal(
    (await service.disableProduct("resume-review", "Repeated", { id: 8 }))
      .enabled,
    false,
  );
  assert.equal(audits.length, 1);
});

test("candidate service keys cannot be reused", async () => {
  const { service } = createCatalogService([
    {
      key: "resume-review",
      name: "Resume review",
      description: "Review.",
      amountPaise: 49900,
      fulfillmentDays: 0,
      enabled: false,
    },
  ]);
  await assert.rejects(
    service.createProduct(
      {
        key: "resume-review",
        name: "Replacement",
        description: "Another service.",
        amountInr: 100,
      },
      { id: 8 },
    ),
    /already exists/,
  );
});
