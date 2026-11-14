const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  PlatformConfigurationService,
  DEFAULT_PLATFORM_CONFIGURATION,
} = require("../dist/platform-config/platform-configuration.service.js");
const {
  DEFAULT_APPLICATION_STAGES,
} = require("../dist/platform-config/default-application-stages.js");
const {
  EmployerApprovalGuard,
} = require("../dist/employers/employer-approval.guard.js");
const { EmployersService } = require("../dist/employers/employers.service.js");
const { AuthService } = require("../dist/auth/auth.service.js");
const {
  EmployerOrganization,
} = require("../dist/employers/organization.entity.js");
const { Job } = require("../dist/jobs/job.entity.js");
const {
  EmployerApprovalStatus,
  UserRole,
} = require("../dist/users/user.entity.js");

function createConfigurationService(initial = null, activeApplications = 0) {
  let configuration = initial;
  const audits = [];
  const repository = {
    findOneBy: async () => configuration,
    create: (value) => ({ ...value }),
    save: async (value) => {
      configuration = { ...value, updatedAt: new Date("2026-01-01T00:00:00Z") };
      return configuration;
    },
  };
  const applications = {
    count: async () => activeApplications,
  };
  const service = new PlatformConfigurationService(
    repository,
    {
      record: async (entry) => audits.push(entry),
    },
    applications,
  );
  return { service, audits, getConfiguration: () => configuration };
}

test("platform configuration defaults preserve registration and approval gates", async () => {
  const { service } = createConfigurationService();

  assert.deepEqual(await service.get(), {
    ...DEFAULT_PLATFORM_CONFIGURATION,
    customized: false,
    updatedAt: null,
  });
  await service.assertRegistrationEnabled("candidate");
  await service.assertRegistrationEnabled("employer");
  await service.assertTaxonomyValue("employmentTypes", "full-time");
  await assert.rejects(
    service.assertTaxonomyValue("employmentTypes", "not-configured"),
    /Choose a configured employmentTypes/,
  );
});

test("admin can add configured application stages and cannot remove one in use", async () => {
  const { service, getConfiguration } = createConfigurationService(
    { id: 1, ...DEFAULT_PLATFORM_CONFIGURATION },
    1,
  );
  const applicationStages = [
    ...DEFAULT_APPLICATION_STAGES,
    {
      key: "phone_screen",
      label: "Phone screen",
      transitions: ["interview", "rejected"],
    },
  ];

  await service.update({ applicationStages }, "Add screening stage", { id: 7 });
  assert.deepEqual(
    getConfiguration().applicationStages.at(-1),
    applicationStages.at(-1),
  );
  await assert.rejects(
    service.update(
      { applicationStages: DEFAULT_APPLICATION_STAGES },
      "Remove screening stage",
      { id: 7 },
    ),
    /cannot be removed while applications are currently in it/,
  );
  await assert.rejects(
    service.update(
      {
        applicationStages: [
          ...DEFAULT_APPLICATION_STAGES,
          { key: "screen", label: "Screen", transitions: ["missing"] },
        ],
      },
      "Reject invalid transition",
      { id: 7 },
    ),
    /transitions must target configured stages/,
  );
});

test("admin can customize supported analytics report definitions", async () => {
  const { service, getConfiguration } = createConfigurationService({
    id: 1,
    ...DEFAULT_PLATFORM_CONFIGURATION,
  });
  const reportDefinitions = [
    {
      key: "hiring_outcomes",
      label: "Recruiting results",
      enabled: true,
    },
    {
      key: "applications_by_source",
      label: "Campaign performance",
      enabled: false,
    },
  ];

  await service.update({ reportDefinitions }, "Customize hiring reports", {
    id: 7,
  });
  assert.deepEqual(getConfiguration().reportDefinitions, reportDefinitions);
  await assert.rejects(
    service.update(
      {
        reportDefinitions: [
          ...reportDefinitions,
          { key: "hiring_outcomes", label: "Duplicate", enabled: true },
        ],
      },
      "Reject duplicate report",
      { id: 7 },
    ),
    /Report keys must be unique/,
  );
  await assert.rejects(
    service.update(
      {
        reportDefinitions: [
          { key: "custom_sql", label: "Unsafe custom report", enabled: true },
        ],
      },
      "Reject unsupported report",
      { id: 7 },
    ),
    /supported key/,
  );
});

test("admin can replace taxonomy defaults and duplicate choices are rejected", async () => {
  const { service, getConfiguration } = createConfigurationService({
    id: 1,
    ...DEFAULT_PLATFORM_CONFIGURATION,
    updatedAt: null,
  });
  const options = {
    ...DEFAULT_PLATFORM_CONFIGURATION,
    jobCategories: ["Engineering", "Clinical"],
  };
  await service.update(options, "Refresh hiring taxonomy", { id: 7 });

  assert.deepEqual(getConfiguration().jobCategories, options.jobCategories);
  assert.deepEqual(
    (await service.jobOptions()).categories,
    options.jobCategories,
  );
  await assert.rejects(
    service.update(
      { industries: ["Healthcare", "healthcare"] },
      "Remove duplicate",
      { id: 7 },
    ),
    /cannot contain duplicate options/,
  );
});

test("platform configuration updates are persisted and audited; reset restores defaults", async () => {
  const { service, audits, getConfiguration } = createConfigurationService({
    id: 1,
    ...DEFAULT_PLATFORM_CONFIGURATION,
    updatedAt: null,
  });
  const actor = { id: 7 };
  const updated = await service.update(
    {
      candidateRegistrationEnabled: false,
      employerRegistrationEnabled: false,
      employerApprovalRequired: false,
      jobApprovalRequired: false,
    },
    "Pause signups and review queues",
    actor,
  );

  assert.equal(updated.candidateRegistrationEnabled, false);
  assert.equal(updated.employerApprovalRequired, false);
  assert.equal(updated.customized, true);
  assert.equal(getConfiguration().jobApprovalRequired, false);
  assert.equal(audits[0].action, "admin.platform_configuration_updated");
  assert.equal(audits[0].details.reason, "Pause signups and review queues");
  await assert.rejects(
    service.assertRegistrationEnabled("candidate"),
    /Candidate registration is currently unavailable/,
  );
  await assert.rejects(
    service.assertRegistrationEnabled("employer"),
    /Employer registration is currently unavailable/,
  );

  const reset = await service.reset("Resume normal operations", actor);
  assert.equal(reset.candidateRegistrationEnabled, true);
  assert.equal(reset.employerRegistrationEnabled, true);
  assert.equal(reset.employerApprovalRequired, true);
  assert.equal(reset.jobApprovalRequired, true);
  assert.equal(reset.customized, false);
  assert.equal(audits[1].action, "admin.platform_configuration_reset");
});

test("disabled account registrations are blocked before requiring delivery providers", async () => {
  const service = new AuthService(
    null,
    null,
    null,
    null,
    null,
    null,
    { assertConfigured: () => assert.fail("SMS provider should not be read") },
    null,
    {
      assertRegistrationEnabled: async (accountType) => {
        throw new Error(
          `${accountType} registration is currently unavailable.`,
        );
      },
    },
  );

  await assert.rejects(
    service.registerCandidate({}),
    /candidate registration is currently unavailable/,
  );
  await assert.rejects(
    service.registerEmployer({}),
    /employer registration is currently unavailable/,
  );
});

test("pending employer access follows the configured approval requirement; rejected employers stay blocked", async () => {
  const guard = Object.create(EmployerApprovalGuard.prototype);
  const routeContext = (status, approvalRequired, method = "POST") => {
    guard.reflector = { getAllAndOverride: () => true };
    guard.platformConfiguration = {
      get: async () => ({ employerApprovalRequired: approvalRequired }),
    };
    const request = {
      method,
      user: {
        role: UserRole.EMPLOYER,
        employerApprovalStatus: status,
      },
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
    };
  };

  assert.equal(
    await guard.canActivate(
      routeContext(EmployerApprovalStatus.PENDING, false),
    ),
    true,
  );
  assert.equal(
    await guard.canActivate(
      routeContext(EmployerApprovalStatus.PENDING, true, "GET"),
    ),
    true,
  );
  await assert.rejects(
    guard.canActivate(routeContext(EmployerApprovalStatus.REJECTED, false)),
    /until an administrator approves it/,
  );
});

test("employer job publication follows the configured moderation gate", async () => {
  async function publish(jobApprovalRequired) {
    const job = {
      id: 42,
      title: "Software Engineer",
      location: "Bengaluru",
      description: "A".repeat(120),
      applicationDeadline: null,
      moderationStatus: "draft",
      moderationNote: null,
      isActive: false,
    };
    const jobsRepository = {
      findOne: async () => job,
      save: async (value) => value,
    };
    const organization = { id: 21 };
    const service = Object.create(EmployersService.prototype);
    Object.assign(service, {
      platformConfiguration: {
        get: async () => ({ jobApprovalRequired }),
      },
      getContext: async () => ({
        organization,
        membership: {},
      }),
      requireRole: () => undefined,
      dataSource: {
        transaction: (callback) =>
          callback({
            getRepository: (entity) => {
              if (entity === EmployerOrganization)
                return { findOne: async () => organization };
              if (entity === Job) return jobsRepository;
              throw new Error("Unexpected repository");
            },
          }),
      },
      assertJobQuota: async () => undefined,
      jobsService: {
        notifyMatchingCandidates: async () => ({ queued: 0, failed: 0 }),
      },
      auditService: { record: async () => undefined },
    });

    return { result: await service.publishJob({ id: 7 }, job.id), job };
  }

  const gated = await publish(true);
  assert.equal(gated.job.isActive, false);
  assert.equal(gated.job.moderationStatus, "pending_review");
  assert.equal(gated.result.reviewRequired, true);

  const automatic = await publish(false);
  assert.equal(automatic.job.isActive, true);
  assert.equal(automatic.job.moderationStatus, "approved");
  assert.deepEqual(automatic.result.alertResult, { queued: 0, failed: 0 });
});
