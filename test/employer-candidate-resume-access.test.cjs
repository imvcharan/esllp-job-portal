const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  ForbiddenException,
  NotFoundException,
} = require("@nestjs/common");
const { EmployersService } = require("../dist/employers/employers.service.js");

function createService({ existingUnlock = false, usage = 0, currentResume = true } = {}) {
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization: { id: 21, planKey: "growth", subscriptionStatus: "active" },
    membership: { role: "recruiter" },
  });
  service.requireRole = () => undefined;
  service.limitsFor = async () => ({
    activeJobs: 25,
    seats: 10,
    resumeCredits: 1,
  });
  service.candidateProfiles = {
    createQueryBuilder() {
      const builder = {
        innerJoinAndSelect() {
          return builder;
        },
        where() {
          return builder;
        },
        andWhere() {
          return builder;
        },
        getOne: async () => ({
          userId: 44,
          resumePath: "44/resume/current.pdf",
          allowRecruiterResumeAccess: true,
          profileVisibility: "recruiters",
        }),
      };
      return builder;
    },
  };
  service.fileStorage = {
    createSignedUrl: async () => "https://storage.example/resume?token=signed",
  };
  service.auditService = { record: async () => undefined };
  service.dataSource = {
    async transaction(callback) {
      return callback({
        getRepository: () => ({
          findOne: async () => ({ id: 21 }),
        }),
        query: async (query) => {
          if (query.includes("SELECT profile.resume_path"))
            return currentResume
              ? [{ resumePath: "44/resume/current.pdf" }]
              : [];
          if (query.includes("SELECT id") && existingUnlock) return [{ id: 1 }];
          if (query.includes("SELECT id")) return [];
          if (query.includes("COUNT(*)")) return [{ used: usage }];
          if (query.includes("INSERT INTO employer_candidate_resume_unlocks"))
            return [];
          throw new Error(`Unexpected SQL in test: ${query}`);
        },
      });
    },
  };
  return service;
}

test("recruiter resume access requires candidate consent and spends a monthly credit once", async () => {
  const service = createService();
  const result = await service.unlockCandidateResume({ id: 8 }, 44);
  assert.equal(result.resumeUrl, "https://storage.example/resume?token=signed");
  assert.equal(result.newlyUnlocked, true);

  const repeated = await createService({ existingUnlock: true }).unlockCandidateResume(
    { id: 8 },
    44,
  );
  assert.equal(repeated.newlyUnlocked, false);
});

test("recruiter resume access stops at the monthly credit limit and rechecks consent", async () => {
  await assert.rejects(
    createService({ usage: 1 }).unlockCandidateResume({ id: 8 }, 44),
    ForbiddenException,
  );
  await assert.rejects(
    createService({ currentResume: false }).unlockCandidateResume(
      { id: 8 },
      44,
    ),
    NotFoundException,
  );
});
