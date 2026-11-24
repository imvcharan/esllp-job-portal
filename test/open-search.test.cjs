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

test("candidate search only prefilters discoverable text fields", async () => {
  let request;
  const service = createSearchService(async (value) => {
    request = value;
    return {
      body: {
        hits: {
          total: { value: 1 },
          hits: [{ _id: "42" }],
        },
      },
    };
  });
  service.candidateIndex = "esllp-candidates";
  service.candidateIndexReady = true;

  assert.deepEqual(await service.searchCandidateIds("react Bengaluru"), [42]);
  assert.equal(request.index, "esllp-candidates");
  assert.deepEqual(request.body.query.bool.must[0], {
    term: { discoverable: true },
  });
  assert.deepEqual(request.body.query.bool.must[1].multi_match.fields, [
    "displayName",
    "headline",
    "location",
    "skills",
  ]);
});

test("candidate search sends unsupported syntax to PostgreSQL", async () => {
  const service = createSearchService(async () => {
    throw new Error("query should not reach OpenSearch");
  });
  service.candidateIndexReady = true;

  assert.equal(await service.searchCandidateIds("React OR Node"), null);
  assert.equal(await service.searchCandidateIds("C++"), null);
});

test("existing indexes are reused and index updates are durably enqueued", async () => {
  const statements = [];
  const service = Object.create(OpenSearchService.prototype);
  service.client = {
    indices: { exists: async () => ({ body: true }) },
  };
  service.index = "esllp-jobs";
  service.candidateIndex = "esllp-candidates";
  service.dataSource = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.includes("SELECT completed_at")) {
        return [{ completedAt: new Date() }];
      }
      if (sql.includes("SELECT backfill.entity_type")) {
        return [
          { entityType: "job", completedAt: new Date(), hasPending: false },
          {
            entityType: "candidate",
            completedAt: new Date(),
            hasPending: false,
          },
        ];
      }
      return [];
    },
  };

  await service.initializeIndex();
  await service.enqueueJob(9);

  assert.equal(service.indexReady, true);
  assert.equal(service.candidateIndexReady, true);
  assert.ok(
    statements.some(({ sql }) =>
      sql.includes("ON CONFLICT (entity_type, entity_id) DO UPDATE"),
    ),
  );
  assert.equal(
    statements.some(({ sql }) =>
      sql.includes("DELETE FROM search_index_backfills"),
    ),
    false,
  );
  let transactionalQuery;
  await service.indexCandidate(43, {
    query: async (sql, params) => {
      transactionalQuery = { sql, params };
    },
  });
  assert.ok(transactionalQuery.sql.includes("search_index_outbox"));
  assert.deepEqual(transactionalQuery.params, ["candidate", 43, "upsert"]);
});
