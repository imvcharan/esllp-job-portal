const assert = require("node:assert/strict");
const { test } = require("node:test");
const { BadRequestException } = require("@nestjs/common");
const { JobsService } = require("../dist/jobs/jobs.service.js");

function createService(job) {
  const audits = [];
  const service = Object.create(JobsService.prototype);
  service.jobsRepository = {
    findOneBy: async () => job,
    save: async (value) => value,
  };
  service.auditService = {
    record: async (entry) => audits.push(entry),
  };
  service.notifyMatchingCandidates = async () => ({ queued: 3, failed: 0 });
  return { service, job, audits };
}

test("admin approval activates a valid job, notifies once, and records the reason", async () => {
  const { service, job, audits } = createService({
    id: 8,
    title: "Platform Engineer",
    location: "Pune",
    description: "A detailed role description ".repeat(5),
    isActive: false,
    moderationStatus: "pending_review",
    applicationDeadline: null,
  });

  const result = await service.moderate(
    8,
    "approved",
    "Employer and listing details reviewed.",
    { id: 2 },
  );

  assert.equal(job.isActive, true);
  assert.equal(job.moderationStatus, "approved");
  assert.deepEqual(result.notificationDelivery, { queued: 3, failed: 0 });
  assert.equal(audits[0].action, "job.moderation_approved");
  assert.equal(audits[0].details.reason, "Employer and listing details reviewed.");
});

test("rejection disables a job without notifying candidates", async () => {
  const { service, job, audits } = createService({
    id: 9,
    isActive: true,
    moderationStatus: "approved",
    applicationDeadline: null,
  });

  const result = await service.moderate(
    9,
    "rejected",
    "Listing does not meet posting requirements.",
    { id: 2 },
  );

  assert.equal(job.isActive, false);
  assert.equal(job.moderationStatus, "rejected");
  assert.equal(result.notificationDelivery, undefined);
  assert.equal(audits[0].action, "job.moderation_rejected");
});

test("approval refuses incomplete or expired listings", async () => {
  const { service } = createService({
    id: 10,
    title: "Engineer",
    location: "Pune",
    description: "Short",
    isActive: false,
    moderationStatus: "pending_review",
    applicationDeadline: null,
  });

  await assert.rejects(
    service.moderate(10, "approved", "Reviewed this listing.", { id: 2 }),
    BadRequestException,
  );
});
