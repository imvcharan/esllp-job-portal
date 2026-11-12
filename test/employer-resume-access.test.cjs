const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ForbiddenException, NotFoundException } = require("@nestjs/common");
const { EmployersService } = require("../dist/employers/employers.service.js");

function createService({
  currentProfile = true,
  existing = false,
  used = 0,
} = {}) {
  const service = Object.create(EmployersService.prototype);
  const queries = [];
  const audits = [];
  const organization = { id: 21 };
  const profile = {
    resumePath: "private/candidate-resume.pdf",
    allowRecruiterResumeAccess: true,
  };
  service.getContext = async () => ({
    organization,
    membership: { role: "recruiter" },
  });
  service.requireRole = () => undefined;
  service.currentResumeCreditPeriod = () => "2026-03";
  service.limitsFor = async () => ({ resumeCredits: 1 });
  service.candidateProfiles = {
    createQueryBuilder: () => {
      const builder = {
        innerJoinAndSelect: () => builder,
        where: () => builder,
        andWhere: () => builder,
        getOne: async () => profile,
      };
      return builder;
    },
  };
  service.fileStorage = {
    createSignedUrl: async (path) => `signed:${path}`,
  };
  service.auditService = {
    record: async (event) => audits.push(event),
  };
  service.dataSource = {
    transaction: async (callback) =>
      callback({
        getRepository: () => ({
          findOne: async () => organization,
        }),
        query: async (sql) => {
          queries.push(sql);
          if (sql.includes("SELECT profile.resume_path"))
            return currentProfile ? [{ resumePath: profile.resumePath }] : [];
          if (sql.includes("SELECT id")) return existing ? [{ id: 1 }] : [];
          if (sql.includes("SELECT COUNT(*)")) return [{ used }];
          return [];
        },
      }),
  };
  return { service, queries, audits };
}

test("resume unlock rechecks candidate consent before consuming a credit", async () => {
  const { service, queries, audits } = createService({ currentProfile: false });

  await assert.rejects(
    service.unlockCandidateResume({ id: 8 }, 42),
    NotFoundException,
  );
  assert.equal(
    queries.some((sql) => sql.includes("INSERT INTO")),
    false,
  );
  assert.equal(audits.length, 0);
});

test("resume unlock consumes one credit and records the access audit", async () => {
  const { service, queries, audits } = createService();

  const result = await service.unlockCandidateResume({ id: 8 }, 42);

  assert.deepEqual(result, {
    resumeUrl: "signed:private/candidate-resume.pdf",
    newlyUnlocked: true,
    periodKey: "2026-03",
  });
  assert.equal(
    queries.some((sql) => sql.includes("INSERT INTO")),
    true,
  );
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "employer.candidate_resume_accessed");
  assert.equal(audits[0].details.newlyUnlocked, true);
});

test("repeat resume access in a period does not consume another credit", async () => {
  const { service, queries, audits } = createService({ existing: true });

  const result = await service.unlockCandidateResume({ id: 8 }, 42);

  assert.equal(result.newlyUnlocked, false);
  assert.equal(
    queries.some((sql) => sql.includes("COUNT(*)")),
    false,
  );
  assert.equal(
    queries.some((sql) => sql.includes("INSERT INTO")),
    false,
  );
  assert.equal(audits[0].details.newlyUnlocked, false);
});

test("resume unlock rejects access after the monthly credit limit is reached", async () => {
  const { service, queries, audits } = createService({ used: 1 });

  await assert.rejects(
    service.unlockCandidateResume({ id: 8 }, 42),
    ForbiddenException,
  );
  assert.equal(
    queries.some((sql) => sql.includes("INSERT INTO")),
    false,
  );
  assert.equal(audits.length, 0);
});
