const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidateSavedSearchesService,
} = require("../dist/users/candidate-saved-searches.service.js");

function createService(searches) {
  return new CandidateSavedSearchesService(
    { findBy: async () => searches },
    { record: async () => {} },
  );
}

test("saved-search skill filters match job skills case-insensitively", async () => {
  const matchingSearch = {
    emailAlerts: true,
    query: "",
    location: "",
    filters: { skill: "script" },
  };
  const nonMatchingSearch = {
    emailAlerts: true,
    query: "",
    location: "",
    filters: { skill: "Java" },
  };
  const service = createService([matchingSearch, nonMatchingSearch]);

  const result = await service.matchingForJob({
    title: "Frontend developer",
    company: "Example",
    location: "Remote",
    skills: ["TypeScript", "React"],
    experience: null,
    salaryCurrency: "INR",
    salaryPeriod: "year",
    salaryMin: null,
    createdAt: new Date(),
  });

  assert.deepEqual(result, [matchingSearch]);
});

test("saved-search keywords also match structured job skills", async () => {
  const matchingSearch = {
    emailAlerts: true,
    query: "react",
    location: "",
    filters: {},
  };
  const service = createService([matchingSearch]);

  const result = await service.matchingForJob({
    title: "Frontend developer",
    company: "Example",
    location: "Remote",
    skills: ["React"],
    experience: null,
    salaryCurrency: "INR",
    salaryPeriod: "year",
    salaryMin: null,
    createdAt: new Date(),
  });

  assert.deepEqual(result, [matchingSearch]);
});

test("saved-search skill filters can be cleared through the update endpoint", async () => {
  const savedSearch = {
    id: 8,
    userId: 3,
    name: "Frontend roles",
    query: "",
    location: "",
    filters: { skill: "React", category: "Engineering" },
    emailAlerts: true,
  };
  const service = new CandidateSavedSearchesService(
    {
      findOneBy: async () => savedSearch,
      save: async (value) => value,
    },
    { record: async () => {} },
  );

  const result = await service.update({ id: 3 }, 8, { skill: "" });

  assert.deepEqual(result.filters, { category: "Engineering" });
});
