const assert = require("node:assert/strict");
const { test } = require("node:test");
const { JobsService } = require("../dist/jobs/jobs.service.js");

function createQueryBuilder() {
  const calls = [];
  return {
    calls,
    where(...args) {
      calls.push(["where", ...args]);
      return this;
    },
    andWhere(...args) {
      calls.push(["andWhere", ...args]);
      return this;
    },
    take() {
      return this;
    },
    skip() {
      return this;
    },
    orderBy(...args) {
      calls.push(["orderBy", ...args]);
      return this;
    },
    addOrderBy(...args) {
      calls.push(["addOrderBy", ...args]);
      return this;
    },
    select() {
      return this;
    },
    async getManyAndCount() {
      await this.waitForQuery;
      return [[], 0];
    },
    async getRawMany() {
      return [];
    },
  };
}

test("public search requires each term in searchable fields and coalesces identical misses", async () => {
  const jobBuilder = createQueryBuilder();
  const companiesBuilder = createQueryBuilder();
  let releaseQuery;
  jobBuilder.waitForQuery = new Promise((resolve) => {
    releaseQuery = resolve;
  });
  let searchCalls = 0;
  const cacheWrites = [];
  const service = Object.create(JobsService.prototype);
  service.publicJobQueries = new Map();
  service.publicJobCacheGeneration = 0;
  service.cache = {
    get: async () => null,
    set: async (...args) => cacheWrites.push(args),
    deleteByPrefix: async () => undefined,
  };
  service.search = {
    searchIds: async () => {
      searchCalls += 1;
      return null;
    },
  };
  service.jobsRepository = {
    createQueryBuilder: (alias) =>
      alias === "job" ? jobBuilder : companiesBuilder,
  };
  service.logger = { warn() {} };

  const first = service.findAll({ query: "Senior Engineer" });
  await new Promise(setImmediate);
  const second = service.findAll({ query: "Senior Engineer" });
  await new Promise(setImmediate);
  await service.invalidatePublicJobCache();
  releaseQuery();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(searchCalls, 1);
  assert.equal(cacheWrites.length, 0);
  const termGroups = jobBuilder.calls
    .filter(
      ([method, expression]) =>
        method === "andWhere" && typeof expression !== "string",
    )
    .map(([, expression]) => {
      const calls = [];
      const builder = {
        where(...args) {
          calls.push(args);
          return this;
        },
        orWhere(...args) {
          calls.push(args);
          return this;
        },
      };
      expression.whereFactory(builder);
      return calls;
    });
  assert.equal(termGroups.length, 2);
  assert.deepEqual(
    termGroups.map((group) => group[0][1]),
    [{ queryTerm0: "%Senior%" }, { queryTerm1: "%Engineer%" }],
  );
  const featuredOrdering = jobBuilder.calls.find(
    ([method]) => method === "orderBy",
  );
  assert.equal(featuredOrdering[0], "orderBy");
  assert.match(featuredOrdering[1], /featured_job_placements/);
  assert.equal(featuredOrdering[2], "DESC");
  assert.deepEqual(
    jobBuilder.calls.find(
      ([method, expression]) =>
        method === "addOrderBy" && expression === "job.createdAt",
    ),
    ["addOrderBy", "job.createdAt", "DESC"],
  );
});

test("empty index results still allow PostgreSQL to return matching jobs", async () => {
  const jobBuilder = createQueryBuilder();
  const companiesBuilder = createQueryBuilder();
  const service = Object.create(JobsService.prototype);
  service.publicJobQueries = new Map();
  service.publicJobCacheGeneration = 0;
  service.search = { searchIds: async () => [] };
  service.jobsRepository = {
    createQueryBuilder: (alias) =>
      alias === "job" ? jobBuilder : companiesBuilder,
  };
  service.logger = { warn() {} };

  await service.findAll({ query: "Engineer" });

  assert.ok(
    jobBuilder.calls.some(
      ([method, expression]) =>
        method === "andWhere" &&
        typeof expression !== "string" &&
        typeof expression.whereFactory === "function",
    ),
  );
  assert.equal(
    jobBuilder.calls.some(
      ([, expression]) =>
        typeof expression === "string" && expression.includes("job.id IN"),
    ),
    false,
  );
});
