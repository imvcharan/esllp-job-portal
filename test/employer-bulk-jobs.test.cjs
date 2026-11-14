const assert = require("node:assert/strict");
const { plainToInstance } = require("class-transformer");
const { validate } = require("class-validator");
const { test } = require("node:test");
const { EmployersService } = require("../dist/employers/employers.service.js");
const { CreateJobDto } = require("../dist/jobs/dto/create-job.dto.js");
const { normalizeJobSkills } = require("../dist/jobs/job.constants.js");
const { BulkCreateEmployerJobsDto } = require("../dist/employers/dto/employer-job.dto.js");
const { OrganizationMemberRole } = require("../dist/employers/organization-member.entity.js");

test("bulk job DTO validates nested jobs and enforces the 50-job limit", async () => {
  const valid = plainToInstance(BulkCreateEmployerJobsDto, {
    jobs: [{ title: "Developer", location: "Remote" }],
  });
  assert.deepEqual(await validate(valid), []);

  const invalid = plainToInstance(BulkCreateEmployerJobsDto, {
    jobs: Array.from({ length: 51 }, (_, index) => ({
      title: `Job ${index}`,
      location: "Remote",
    })),
  });
  assert.ok((await validate(invalid)).some((error) => error.property === "jobs"));

  const invalidNestedJob = plainToInstance(BulkCreateEmployerJobsDto, {
    jobs: [{ title: "Developer", location: "Remote", unexpected: true }],
  });
  assert.ok(
    (
      await validate(invalidNestedJob, {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).length > 0,
  );
});

test("job DTOs validate skill limits and normalization removes duplicates", async () => {
  const validJob = plainToInstance(CreateJobDto, {
    title: "Developer",
    company: "Example",
    location: "Remote",
    skills: ["JavaScript", "SQL"],
  });
  assert.deepEqual(await validate(validJob), []);

  const invalidEmployerJob = plainToInstance(BulkCreateEmployerJobsDto, {
    jobs: [
      {
        title: "Developer",
        location: "Remote",
        skills: ["x".repeat(61)],
      },
    ],
  });
  assert.ok((await validate(invalidEmployerJob)).length > 0);

  const tooManySkills = plainToInstance(CreateJobDto, {
    title: "Developer",
    company: "Example",
    location: "Remote",
    skills: Array.from({ length: 31 }, (_, index) => `Skill ${index}`),
  });
  assert.ok(
    (await validate(tooManySkills)).some((error) => error.property === "skills"),
  );
  assert.deepEqual(
    normalizeJobSkills([" JavaScript ", "javascript", "", "SQL"]),
    ["JavaScript", "SQL"],
  );
});

test("bulk job creation saves private tenant-owned drafts and audits each row transactionally", async () => {
  const service = Object.create(EmployersService.prototype);
  const savedJobs = [];
  const auditEvents = [];
  const transactionManager = {};
  const context = {
    organization: { id: 12, name: "Example Corp" },
    membership: { role: OrganizationMemberRole.OWNER },
  };
  const repository = {
    create: (job) => ({ ...job }),
    save: async (job) => {
      const saved = { ...job, id: savedJobs.length + 1 };
      savedJobs.push(saved);
      return saved;
    },
  };
  transactionManager.getRepository = () => repository;
  service.getContext = async () => context;
  service.requireRole = () => {};
  service.platformConfiguration = { assertTaxonomyValue: async () => {} };
  service.dataSource = {
    transaction: async (callback) => callback(transactionManager),
  };
  service.auditService = {
    record: async (event, manager) => auditEvents.push({ event, manager }),
  };

  const result = await service.bulkCreateJobs(
    { id: 7 },
    [
      {
        title: " Developer ",
        location: " Remote ",
        salaryMin: 50000,
        skills: [" TypeScript ", "typescript", "PostgreSQL"],
      },
      { title: "Designer", location: "Hybrid city", workplaceType: "hybrid" },
    ],
    12,
  );

  assert.equal(result.total, 2);
  assert.deepEqual(
    result.items.map(
      ({
        title,
        company,
        location,
        organizationId,
        employerUserId,
        isActive,
        moderationStatus,
        skills,
      }) => ({
        title,
        company,
        location,
        organizationId,
        employerUserId,
        isActive,
        moderationStatus,
        skills,
      }),
    ),
    [
      {
        title: "Developer",
        company: "Example Corp",
        location: "Remote",
        organizationId: 12,
        employerUserId: 7,
        isActive: false,
        moderationStatus: "draft",
        skills: ["TypeScript", "PostgreSQL"],
      },
      {
        title: "Designer",
        company: "Example Corp",
        location: "Hybrid city",
        organizationId: 12,
        employerUserId: 7,
        isActive: false,
        moderationStatus: "draft",
        skills: [],
      },
    ],
  );
  assert.equal(auditEvents.length, 2);
  assert.ok(auditEvents.every(({ manager }) => manager === transactionManager));
  assert.ok(
    auditEvents.every(({ event }) => event.details.source === "bulk_import"),
  );
});

test("bulk job creation rejects invalid salary ranges before saving that row", async () => {
  const service = Object.create(EmployersService.prototype);
  let saveCount = 0;
  const repository = {
    create: (job) => ({ ...job }),
    save: async (job) => {
      saveCount += 1;
      return job;
    },
  };
  service.getContext = async () => ({
    organization: { id: 12, name: "Example Corp" },
    membership: { role: OrganizationMemberRole.OWNER },
  });
  service.requireRole = () => {};
  service.platformConfiguration = { assertTaxonomyValue: async () => {} };
  service.dataSource = {
    transaction: async (callback) =>
      callback({ getRepository: () => repository }),
  };
  service.auditService = { record: async () => {} };

  await assert.rejects(
    service.bulkCreateJobs(
      { id: 7 },
      [
        {
          title: "Developer",
          location: "Remote",
          salaryMin: 100,
          salaryMax: 10,
        },
      ],
      12,
    ),
    /Minimum salary cannot exceed maximum salary/,
  );
  assert.equal(saveCount, 0);
});
