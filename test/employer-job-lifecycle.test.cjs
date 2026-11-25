const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ConflictException } = require("@nestjs/common");
const { JobsService } = require("../dist/jobs/jobs.service.js");
const { Job } = require("../dist/jobs/job.entity.js");
const {
  EmployerOrganization,
} = require("../dist/employers/organization.entity.js");
const {
  FeaturedJobPlacement,
} = require("../dist/employers/featured-job-placement.entity.js");

test("admin moderation refuses activation when the organization quota is full", async () => {
  const job = {
    id: 7,
    title: "Engineer",
    location: "Remote",
    description: "A detailed job description. ".repeat(5),
    isActive: false,
    organizationId: 12,
    moderationStatus: "pending_review",
    applicationDeadline: null,
  };
  const service = Object.create(JobsService.prototype);
  const saved = [];
  const jobRepository = {
    findOneBy: async () => job,
    findOne: async () => job,
    save: async (value) => {
      saved.push(value);
      return value;
    },
  };
  service.jobsRepository = {
    manager: {
      transaction: async (callback) =>
        callback({
          getRepository: () => jobRepository,
        }),
    },
  };
  service.assertOrganizationJobQuota = async () => {
    throw new ConflictException("Plan quota reached.");
  };

  await assert.rejects(
    service.moderate(7, "approved", "Reviewed.", { id: 1 }),
    ConflictException,
  );
  assert.equal(job.isActive, false);
  assert.deepEqual(saved, []);
});

test("admin quota helper counts active company jobs against the same paid-plan limits", async () => {
  const service = Object.create(JobsService.prototype);
  service.razorpayConfiguration = {
    billingPolicy: async () => ({ pastDueGraceDays: 0 }),
    employerPlans: async () => ({
      growth: { activeJobs: 3, seats: 4, resumeCredits: 5 },
    }),
  };
  const countBuilder = {
    where: () => countBuilder,
    andWhere: () => countBuilder,
    getCount: async () => 3,
  };
  const manager = {
    getRepository: (entity) =>
      entity === EmployerOrganization
        ? {
            findOne: async () => ({
              id: 12,
              planKey: "growth",
              subscriptionStatus: "active",
              subscriptionPlanSnapshot: null,
            }),
          }
        : { createQueryBuilder: () => countBuilder },
  };

  await assert.rejects(
    service.assertOrganizationJobQuota(manager, 12),
    ConflictException,
  );
});

test("deadline expiry deactivates jobs and schedules search-index updates", async () => {
  const statements = [];
  const indexed = [];
  const service = Object.create(JobsService.prototype);
  service.jobsRepository = {
    manager: {
      transaction: async (callback) =>
        callback({
          query: async (sql) => {
            statements.push(sql);
            if (sql.includes("WITH due_jobs")) return [{ id: 11 }];
            return [];
          },
        }),
    },
  };
  service.search = {
    enqueueJob: async (id) => indexed.push(id),
  };
  service.cache = null;
  service.publicJobCacheGeneration = 0;

  assert.equal(await service.expireDueJobs(10), 1);
  assert.deepEqual(indexed, [11]);
  assert.match(statements[0], /application_deadline/);
  assert.match(statements[0], /Asia\/Kolkata/);
  assert.match(statements[0], /SKIP LOCKED/);
  assert.ok(statements.some((sql) => sql.includes("featured_job_placements")));
});

test("material employer edits pause published jobs for moderation", async () => {
  const job = {
    id: 9,
    title: "Engineer",
    company: "Example Corp",
    location: "Remote",
    category: null,
    industry: null,
    skills: [],
    workplaceType: "remote",
    employmentType: "full-time",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "INR",
    salaryPeriod: "year",
    applicationDeadline: null,
    numberOfOpenings: 1,
    experience: null,
    description: "A detailed job description. ".repeat(5),
    applicationQuestions: [],
    requiredDocuments: [],
    isActive: true,
    moderationStatus: "approved",
    moderationNote: null,
  };
  const audits = [];
  const service = Object.create(
    require("../dist/employers/employers.service.js").EmployersService
      .prototype,
  );
  service.getContext = async () => ({
    organization: { id: 12, name: "Example Corp" },
    membership: { role: "recruiter" },
  });
  service.requireRole = () => {};
  service.findOrganizationJob = async () => job;
  service.platformConfiguration = {
    get: async () => ({ jobApprovalRequired: true }),
    assertTaxonomyValue: async () => {},
  };
  service.validateSalary = () => {};
  service.jobsService = { syncSearchIndex: async () => {} };
  service.dataSource = {
    transaction: async (callback) =>
      callback({ getRepository: () => ({ save: async (value) => value }) }),
  };
  service.auditService = {
    record: async (entry) => audits.push(entry),
  };

  const result = await service.updateJob(
    { id: 7 },
    9,
    { title: "Senior Engineer" },
    12,
  );

  assert.equal(result.isActive, false);
  assert.equal(result.moderationStatus, "pending_review");
  assert.equal(result.reviewRequired, true);
  assert.equal(audits[0].action, "employer.job_updated");
});

test("featured placement creation validates active company jobs and records placements", async () => {
  const job = {
    id: 8,
    organizationId: 12,
    isActive: true,
    applicationDeadline: null,
  };
  const organization = { id: 12, name: "Example Corp" };
  let created;
  const audits = [];
  const service = Object.create(JobsService.prototype);
  const repositories = new Map([
    [
      Job,
      {
        findOneBy: async () => job,
        findOne: async () => job,
      },
    ],
    [EmployerOrganization, { findOne: async () => organization }],
    [
      FeaturedJobPlacement,
      {
        save: async (value) => {
          created = { ...value, id: 3 };
          return created;
        },
      },
    ],
  ]);
  service.jobsRepository = {
    manager: {
      transaction: async (callback) =>
        callback({
          getRepository: (entity) => repositories.get(entity),
          query: async () => [],
        }),
    },
  };
  service.auditService = {
    record: async (entry) => audits.push(entry),
  };
  service.cache = null;

  const placement = await service.createFeaturedPlacement(
    {
      jobId: 8,
      placementType: "search",
      startsAt: "2030-01-01T10:00:00.000Z",
      endsAt: "2030-01-08T10:00:00.000Z",
      paymentReference: " pay_123 ",
    },
    { id: 2 },
  );

  assert.equal(placement.status, "scheduled");
  assert.equal(placement.organizationId, 12);
  assert.equal(placement.paymentReference, "pay_123");
  assert.equal(audits[0].action, "admin.featured_job_placement_created");
  assert.equal(created.jobId, 8);
});
