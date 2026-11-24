const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  OpenSearchService,
} = require("../dist/infrastructure/open-search.service.js");

function createSearchService(search) {
  const service = Object.create(OpenSearchService.prototype);
  service.client = { search };
  service.index = "esllp-jobs";
  service.indexReady = true;
  service.logger = { warn() {} };
  return service;
}

test("OpenSearch returns job IDs in relevance order", async () => {
  let request;
  const service = createSearchService(async (value) => {
    request = value;
    return {
      body: {
        hits: {
          total: { value: 2 },
          hits: [{ _id: "42" }, { _id: "7" }, { _id: "invalid" }],
        },
      },
    };
  });

  assert.deepEqual(await service.searchIds({ query: "designer" }), [42, 7]);
  assert.equal(request.body.size, 10_000);
  assert.deepEqual(request.body.sort, [
    { _score: "desc" },
    { createdAt: "desc" },
  ]);
});

test("OpenSearch falls back to PostgreSQL for incomplete result windows", async () => {
  const service = createSearchService(async () => ({
    body: { hits: { total: { value: 10_001 }, hits: [] } },
  }));

  assert.equal(await service.searchIds({ query: "engineer" }), null);
});

test("OpenSearch falls back to PostgreSQL when unavailable or query fails", async () => {
  const unavailable = Object.create(OpenSearchService.prototype);
  unavailable.client = null;
  assert.equal(await unavailable.searchIds({ query: "engineer" }), null);

  const service = createSearchService(async () => {
    throw new Error("offline");
  });
  assert.equal(await service.searchIds({ query: "engineer" }), null);
});

test("OpenSearch delegates unsupported token lengths to PostgreSQL", async () => {
  const service = createSearchService(async () => {
    throw new Error("query should not reach OpenSearch");
  });

  assert.equal(await service.searchIds({ query: "x" }), null);
  assert.equal(
    await service.searchIds({ query: "abcdefghijklmnopqrstu" }),
    null,
  );
});
