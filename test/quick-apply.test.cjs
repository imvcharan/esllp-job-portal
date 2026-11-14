const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidateApplicationsService,
} = require("../dist/users/candidate-applications.service.js");
const {
  CandidateQuickApplyPreference,
} = require("../dist/users/candidate-quick-apply-preference.entity.js");
const { Job } = require("../dist/jobs/job.entity.js");

test("saving quick-apply choices records explicit per-job consent and audits it", async () => {
  const audits = [];
  const preferenceRepository = {
    findOneBy: async () => null,
    create: (preference) => preference,
    save: async (preference) => preference,
  };
  const service = Object.create(CandidateApplicationsService.prototype);
  service.jobsRepository = {
    findOneBy: async () => ({
      id: 7,
      isActive: true,
      applicationQuestions: [],
      requiredDocuments: [],
    }),
  };
  service.applicationsRepository = { findOne: async () => null };
  service.profilesRepository = { findOneBy: async () => null };
  service.dataSource = {
    getRepository: (entity) => {
      assert.equal(entity, CandidateQuickApplyPreference);
      return preferenceRepository;
    },
  };
  service.auditService = {
    record: async (audit) => audits.push(audit),
  };

  const result = await service.saveQuickApplyPreference({ id: 42 }, 7, {
    includeResume: false,
    shareProfile: false,
  });

  assert.equal(result.includeResume, false);
  assert.equal(result.shareProfile, false);
  assert.ok(result.consentedAt instanceof Date);
  assert.equal(audits[0].action, "candidate.quick_apply_preferences_saved");
  assert.equal(audits[0].targetId, 7);
});

test("quick apply requires saved per-job sharing consent and uses those choices", async () => {
  const service = Object.create(CandidateApplicationsService.prototype);
  const preference = {
    includeResume: true,
    shareProfile: false,
  };
  service.dataSource = {
    getRepository: (entity) => {
      assert.equal(entity, CandidateQuickApplyPreference);
      return { findOneBy: async () => preference };
    },
  };
  service.submit = async (...args) => args;
  const attribution = { source: "campaign" };

  const result = await service.quickApply({ id: 42 }, 7, {
    sourceAttribution: attribution,
  });

  assert.deepEqual(result, [
    { id: 42 },
    7,
    {
      includeResume: true,
      shareProfile: false,
      sourceAttribution: attribution,
    },
    true,
  ]);
});

test("quick apply cannot proceed without saved consent", async () => {
  const service = Object.create(CandidateApplicationsService.prototype);
  let submitted = false;
  service.dataSource = {
    getRepository: () => ({ findOneBy: async () => null }),
  };
  service.submit = async () => {
    submitted = true;
  };

  await assert.rejects(
    () => service.quickApply({ id: 42 }, 7, {}),
    /Save your sharing choices/,
  );
  assert.equal(submitted, false);
});

test("saving quick-apply choices rejects roles that request additional inputs", async () => {
  const service = Object.create(CandidateApplicationsService.prototype);
  service.jobsRepository = {
    findOneBy: async () => ({
      id: 7,
      isActive: true,
      applicationQuestions: [],
      requiredDocuments: [{ id: "portfolio", required: false }],
    }),
  };

  await assert.rejects(
    () =>
      service.saveQuickApplyPreference({ id: 42 }, 7, {
        includeResume: false,
        shareProfile: false,
      }),
    /requires additional answers or documents/,
  );
});

test("quick apply rejects roles that add application questions or documents", async () => {
  const job = {
    id: 7,
    isActive: true,
    applicationQuestions: [{ id: "availability", required: true }],
    requiredDocuments: [],
  };
  const jobRepository = {
    createQueryBuilder: () => ({
      where() {
        return this;
      },
      andWhere() {
        return this;
      },
      setLock() {
        return this;
      },
      getOne: async () => job,
    }),
  };
  const service = Object.create(CandidateApplicationsService.prototype);
  service.applicationsRepository = { findOne: async () => null };
  service.jobsRepository = { findOneBy: async () => job };
  service.profilesRepository = { findOneBy: async () => null };
  service.usersRepository = {
    findOneBy: async () => ({ id: 42, isActive: true }),
  };
  service.dataSource = {
    transaction: async (callback) =>
      callback({
        getRepository(entity) {
          assert.equal(entity, Job);
          return jobRepository;
        },
      }),
  };

  await assert.rejects(
    () =>
      service.submit(
        { id: 42 },
        7,
        { includeResume: false, shareProfile: false },
        true,
      ),
    /requires additional answers or documents/,
  );
});
