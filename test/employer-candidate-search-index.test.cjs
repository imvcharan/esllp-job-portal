const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EmployersService } = require("../dist/employers/employers.service.js");

class QueryBuilder {
  constructor(profile) {
    this.profile = profile;
    this.calls = [];
  }

  record(method, args) {
    this.calls.push([method, ...args]);
    return this;
  }
  innerJoinAndSelect(...args) {
    return this.record("innerJoinAndSelect", args);
  }
  where(...args) {
    return this.record("where", args);
  }
  andWhere(...args) {
    return this.record("andWhere", args);
  }
  orderBy(...args) {
    return this.record("orderBy", args);
  }
  addOrderBy(...args) {
    return this.record("addOrderBy", args);
  }
  skip(...args) {
    return this.record("skip", args);
  }
  take(...args) {
    return this.record("take", args);
  }
  async getManyAndCount() {
    return [[this.profile], 1];
  }
}

test("candidate index IDs are rechecked against recruiter visibility in PostgreSQL", async () => {
  const profile = {
    userId: 42,
    user: { displayName: "Candidate" },
    headline: "Engineer",
    location: "Bengaluru",
    summary: "Experienced developer",
    skills: '["React"]',
    experience: [],
    education: [],
    certifications: [],
    premiumBoostUntil: null,
    resumePath: "private/candidate.pdf",
    allowRecruiterResumeAccess: true,
    allowRecruiterContact: false,
  };
  const builder = new QueryBuilder(profile);
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization: { id: 8 },
    membership: {},
  });
  service.requireRole = () => {};
  service.candidateProfiles = {
    createQueryBuilder: () => builder,
  };
  service.search = { searchCandidateIds: async () => [42] };
  service.fileStorage = {
    scanStatuses: async () =>
      new Map([["private/candidate.pdf", "pending"]]),
  };
  service.limitsFor = async () => ({ resumeCredits: 5 });
  service.dataSource = {
    query: async () => [{ used: 0, candidateIds: [] }],
  };
  service.auditService = { record: async () => {} };

  const result = await service.searchCandidates({ id: 7 }, "React");

  assert.equal(result.items[0].candidateId, 42);
  assert.equal(result.items[0].resumeAccessAvailable, false);
  assert.equal(result.items[0].resumeScanStatus, "pending");
  assert.ok(
    builder.calls.some(
      ([method, expression, parameters]) =>
        method === "where" &&
        expression.includes("profile.profileVisibility") &&
        parameters.visibility === "recruiters",
    ),
  );
  assert.ok(
    builder.calls.some(
      ([method, expression, parameters]) =>
        method === "andWhere" &&
        expression.includes("candidate.isActive = true") &&
        parameters.role === "candidate",
    ),
  );
  assert.ok(
    builder.calls.some(
      ([method, expression, parameters]) =>
        method === "andWhere" &&
        expression === "profile.userId IN (:...candidateSearchIds)" &&
        parameters.candidateSearchIds[0] === 42,
    ),
  );
});

test("candidate search rejects oversized input before contacting OpenSearch", async () => {
  const service = Object.create(EmployersService.prototype);
  let searchCalled = false;
  service.getContext = async () => ({
    organization: { id: 8 },
    membership: {},
  });
  service.requireRole = () => {};
  service.search = {
    searchCandidateIds: async () => {
      searchCalled = true;
      return [];
    },
  };

  await assert.rejects(
    service.searchCandidates({ id: 7 }, "x".repeat(501)),
    /500 characters or fewer/,
  );
  assert.equal(searchCalled, false);
});
