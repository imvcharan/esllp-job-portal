const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidateRecommendationsService,
} = require("../dist/users/candidate-recommendations.service.js");

const now = new Date();

function createService(profile, jobs) {
  const query = {
    where() {
      return this;
    },
    andWhere() {
      return this;
    },
    orderBy() {
      return this;
    },
    take() {
      return this;
    },
    getMany: async () => jobs,
  };
  return new CandidateRecommendationsService(
    { findOneBy: async () => profile },
    { createQueryBuilder: () => query },
  );
}

function profile(overrides = {}) {
  return {
    desiredJobTitles: ["Backend engineer"],
    skills: JSON.stringify(["TypeScript", "PostgreSQL"]),
    location: "Pune",
    workplaceTypes: ["hybrid"],
    employmentTypes: ["full-time"],
    salaryPreferences: { minimum: 1_000_000, currency: "INR", period: "year" },
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    id: 8,
    title: "Backend Engineer",
    company: "Example",
    location: "Pune",
    workplaceType: "hybrid",
    employmentType: "full-time",
    salaryMin: 1_500_000,
    salaryCurrency: "INR",
    salaryPeriod: "year",
    description: "Build TypeScript services with PostgreSQL.",
    createdAt: now,
    ...overrides,
  };
}

test("recommendations rank published roles with explainable profile matches", async () => {
  const service = createService(profile(), [job()]);
  const result = await service.getForCandidate({ id: 4 });

  assert.equal(result.personalized, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].score, 11);
  assert.ok(result.items[0].reasons.some((reason) => reason.includes("TypeScript")));
});

test("salary preferences exclude incompatible jobs", async () => {
  const service = createService(profile(), [
    job({ salaryCurrency: "USD" }),
    job({ salaryMin: 900_000 }),
  ]);
  const result = await service.getForCandidate({ id: 4 });

  assert.deepEqual(result.items, []);
  assert.equal(result.personalized, true);
});

test("recommendations invite candidates with no saved preferences to update profile", async () => {
  const service = createService(
    profile({
      desiredJobTitles: [],
      skills: "[]",
      location: "",
      workplaceTypes: [],
      employmentTypes: [],
      salaryPreferences: {},
    }),
    [job()],
  );
  const result = await service.getForCandidate({ id: 4 });

  assert.equal(result.personalized, false);
  assert.deepEqual(result.items, []);
  assert.match(result.message, /Add your skills/);
});
