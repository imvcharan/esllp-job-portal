const assert = require("node:assert/strict");
const { test } = require("node:test");
const { JobsService } = require("../dist/jobs/jobs.service.js");
const {
  MIN_JOB_DESCRIPTION_LENGTH,
  jobPublicationError,
} = require("../dist/jobs/job.constants.js");

class QueryBuilder {
  constructor(result) {
    this.calls = [];
    this.result = result;
  }

  where(...args) {
    return this.record("where", args);
  }
  andWhere(...args) {
    return this.record("andWhere", args);
  }
  take(...args) {
    return this.record("take", args);
  }
  skip(...args) {
    return this.record("skip", args);
  }
  orderBy(...args) {
    return this.record("orderBy", args);
  }
  addOrderBy(...args) {
    return this.record("addOrderBy", args);
  }
  select(...args) {
    return this.record("select", args);
  }

  record(method, args) {
    this.calls.push([method, ...args]);
    return this;
  }

  async getManyAndCount() {
    return this.result;
  }

  async getRawMany() {
    return this.result;
  }
}

function createService() {
  const job = { id: 7, title: "Engineer" };
  const builders = [];
  const jobsRepository = {
    createQueryBuilder() {
      const builder = new QueryBuilder(
        builders.length === 0 ? [[job], 1] : [{ company: "Example" }],
      );
      builders.push(builder);
      return builder;
    },
    manager: {
      query: async () => [],
    },
  };
  const service = new JobsService(
    jobsRepository,
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {
      assertTaxonomyValue: async () => {},
      jobOptions: async () => ({}),
    },
    {
      billingPolicy: async () => ({ pastDueGraceDays: 0 }),
      employerPlans: async () => ({}),
    },
  );
  return { service, builders, job };
}

test("public search applies bounded pagination and returns live company options", async () => {
  const { service, builders, job } = createService();

  const result = await service.findAll({ page: 0, limit: 500 });

  assert.deepEqual(result, {
    items: [{ ...job, featuredPlacementTypes: [] }],
    total: 1,
    page: 1,
    limit: 100,
    companies: ["Example"],
  });
  assert.ok(
    builders[0].calls.some(
      ([method, value]) => method === "take" && value === 100,
    ),
  );
  assert.ok(
    builders[0].calls.some(
      ([method, value]) => method === "skip" && value === 0,
    ),
  );
});

test("public skill filtering rejects unsupported or oversized input", async () => {
  const { service } = createService();

  await assert.rejects(
    service.findAll({ skill: "x".repeat(61) }),
    /60 characters or fewer/,
  );
  await assert.rejects(service.findAll({ skill: ["React"] }), /must be text/);
});

test("public search bounds text and numeric filters before querying providers", async () => {
  const { service, builders } = createService();

  await assert.rejects(
    service.findAll({ query: "x".repeat(121) }),
    /120 characters or fewer/,
  );
  await assert.rejects(
    service.findAll({ location: ["Remote"] }),
    /must be text/,
  );
  await assert.rejects(
    service.findAll({ minimumSalary: 2_000_000_001 }),
    /outside the supported range/,
  );
  await assert.rejects(
    service.findAll({ freshnessDays: 3_651 }),
    /between 0 and 3650/,
  );
  assert.equal(builders.length, 0);
});

test("public search enforces publication eligibility and combines search filters", async () => {
  const { service, builders } = createService();

  const result = await service.findAll({
    query: "  engineer  ",
    location: " Bengaluru ",
    workplaceType: "remote",
    employmentType: "full-time",
    category: "Engineering",
    industry: "Technology",
    company: "Example",
    minimumSalary: 50000,
    salaryCurrency: "INR",
    salaryPeriod: "year",
    freshnessDays: 30,
    sort: "salary",
    skill: " React ",
    page: 2,
    limit: 10,
  });

  test("job publication requires title, location, and a description of at least 100 characters", () => {
    const base = {
      title: "Engineer",
      location: "Pune",
      description: "x".repeat(MIN_JOB_DESCRIPTION_LENGTH),
    };

    assert.equal(MIN_JOB_DESCRIPTION_LENGTH, 100);
    assert.equal(jobPublicationError(base), null);
    assert.match(
      jobPublicationError({ ...base, description: "x".repeat(99) }),
      /at least 100 characters/,
    );
    assert.match(
      jobPublicationError({ ...base, location: " " }),
      /title and location/,
    );
  });

  const calls = builders[0].calls;
  const serializedCalls = JSON.stringify(calls);
  assert.ok(
    calls.some(
      ([method, expression, parameters]) =>
        method === "andWhere" &&
        expression === "job.category = :category" &&
        parameters.category === "Engineering",
    ),
  );
  assert.ok(
    calls.some(
      ([method, expression, parameters]) =>
        method === "andWhere" &&
        expression === "job.industry = :industry" &&
        parameters.industry === "Technology",
    ),
  );
  assert.equal(result.page, 2);
  assert.equal(result.limit, 10);
  assert.match(serializedCalls, /job\.isActive/);
  assert.match(serializedCalls, /job\.applicationDeadline/);
  assert.match(serializedCalls, /Bengaluru/);
  assert.match(serializedCalls, /remote/);
  assert.match(serializedCalls, /full-time/);
  assert.match(serializedCalls, /minimumSalary/);
  assert.match(serializedCalls, /freshnessDays/);
  assert.ok(
    calls.some(
      ([method, expression, parameters]) =>
        method === "andWhere" &&
        typeof expression === "string" &&
        expression.includes("jsonb_array_elements_text(job.skills)") &&
        parameters.skill === "%React%",
    ),
  );
  assert.ok(
    calls.some(
      ([method, field]) =>
        method === "addOrderBy" && field === "job.salaryCurrency",
    ),
  );
  const searchBrackets = calls.find(
    ([method, brackets]) =>
      method === "andWhere" && typeof brackets?.whereFactory === "function",
  )?.[1];
  const searchConditions = [];
  const whereBuilder = {
    where(...args) {
      searchConditions.push(["where", ...args]);
      return this;
    },
    orWhere(...args) {
      searchConditions.push(["orWhere", ...args]);
      return this;
    },
  };
  searchBrackets.whereFactory(whereBuilder);
  assert.deepEqual(searchConditions, [
    [
      "where",
      "job.title ILIKE :queryTerm0 ESCAPE '\\'",
      { queryTerm0: "%engineer%" },
    ],
    [
      "orWhere",
      "job.company ILIKE :queryTerm0 ESCAPE '\\'",
      { queryTerm0: "%engineer%" },
    ],
    [
      "orWhere",
      "job.description ILIKE :queryTerm0 ESCAPE '\\'",
      { queryTerm0: "%engineer%" },
    ],
    [
      "orWhere",
      `EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(job.skills) AS job_skill(skill)
                WHERE job_skill.skill ILIKE :queryTerm0 ESCAPE '\\'
              )`,
      { queryTerm0: "%engineer%" },
    ],
  ]);
});
