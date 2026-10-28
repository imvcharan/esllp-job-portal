const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ConflictException } = require("@nestjs/common");
const { JobsService } = require("../dist/jobs/jobs.service.js");
const {
  CandidateApplication,
} = require("../dist/users/candidate-application.entity.js");
const {
  CandidateSavedJob,
} = require("../dist/users/candidate-saved-job.entity.js");
const { Job } = require("../dist/jobs/job.entity.js");
const { Report } = require("../dist/reports/report.entity.js");

function createService({ linkedEntity } = {}) {
  const audits = [];
  const removedIds = [];
  const job = { id: 12, title: "Designer" };
  const manager = {
    getRepository(entity) {
      if (entity === Job) {
        return {
          findOne: async () => job,
          delete: async (id) => removedIds.push(id),
        };
      }
      return { countBy: async () => (entity === linkedEntity ? 1 : 0) };
    },
  };
  const jobsRepository = {
    manager: {
      transaction: async (callback) => callback(manager),
    },
  };
  const service = new JobsService(
    jobsRepository,
    {},
    {},
    {},
    { record: async (entry) => audits.push(entry) },
    {},
    {},
  );
  return { service, audits, removedIds };
}

test("permanently deletes an unlinked job and records an audit event", async () => {
  const { service, audits, removedIds } = createService();

  const result = await service.permanentlyDelete(12, { id: 3 }, "127.0.0.1");

  assert.deepEqual(result, { success: true });
  assert.deepEqual(removedIds, [12]);
  assert.equal(audits[0].action, "job.permanently_deleted");
  assert.equal(audits[0].details.title, "Designer");
});

test("blocks permanent job deletion when applications or other linked records exist", async () => {
  for (const linkedEntity of [
    CandidateApplication,
    CandidateSavedJob,
    Report,
  ]) {
    const { service, audits, removedIds } = createService({ linkedEntity });

    await assert.rejects(
      service.permanentlyDelete(12, { id: 3 }),
      ConflictException,
    );
    assert.deepEqual(removedIds, []);
    assert.deepEqual(audits, []);
  }
});
