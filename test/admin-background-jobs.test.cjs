const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  AdminBackgroundJobsController,
} = require("../dist/admin/admin-background-jobs.controller.js");

test("background jobs dashboard aggregates integration and backlog status", async () => {
  const controller = new AdminBackgroundJobsController(
    {
      operationalStatus: async () => ({
        enabled: true,
        ready: true,
        activeWorkerInstances: 1,
        queues: [],
      }),
    },
    {
      operationalStatus: async () => ({
        enabled: true,
        jobs: { ready: false, pending: 12, due: 4, highAttempts: 1 },
        candidates: { ready: true, pending: 0, due: 0, highAttempts: 0 },
        recentFailures: [],
      }),
    },
    { enabled: true, ready: true },
    {
      outboxOperationalStatus: async () => ({
        counts: { queued: 3, failed: 1 },
        due: 2,
      }),
    },
    { record: async () => undefined },
    {
      operationalStatus: async () => ({
        storage: { configured: true, ready: true },
        scanner: { configured: true, ready: true },
        counts: {
          scans: { pending: 2, infected: 1, retrying: 0 },
          cleanup: { pending: 3, highAttempts: 1 },
        },
        workerEnabled: true,
      }),
    },
  );

  const status = await controller.status();

  assert.equal(status.queues.activeWorkerInstances, 1);
  assert.equal(status.indexing.jobs.pending, 12);
  assert.equal(status.emailOutbox.due, 2);
  assert.equal(status.privateFiles.counts.scans.pending, 2);
  assert.deepEqual(status.cache, { enabled: true, ready: true });
});

test("manual index retry is audited with the supplied reason", async () => {
  let auditEvent;
  const controller = new AdminBackgroundJobsController(
    {},
    { retryIndexingRecord: async () => ({ entityType: "job" }) },
    {},
    {},
    { record: async (event) => (auditEvent = event) },
  );

  assert.deepEqual(
    await controller.retryIndexingRecord(
      19,
      { reason: "Retry after OpenSearch recovery" },
      { id: 7 },
    ),
    { queued: true },
  );
  assert.equal(auditEvent.action, "admin.search_index_record_retried");
  assert.equal(auditEvent.targetId, 19);
  assert.equal(auditEvent.details.reason, "Retry after OpenSearch recovery");
});
