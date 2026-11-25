const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidateDeletionProcessor,
} = require("../dist/users/candidate-deletion-processor.service.js");

function createProcessor({ cleanupQueueFailure = false } = {}) {
  const statements = [];
  const queuedFiles = [];
  const searchRemovals = [];
  const manager = {
    query: async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (sql.includes("FROM candidate_deletion_requests")) {
        return [{ id: 19, requesterUserId: 7 }];
      }
      if (sql.includes("FROM users")) {
        return [{ id: 7, email: "candidate@example.test", role: "candidate" }];
      }
      if (sql.includes("SELECT file_path AS path")) {
        return [{ path: "7/resume/resume.pdf" }];
      }
      return [];
    },
  };
  const dataSource = {
    transaction: async (callback) => callback(manager),
  };
  const storage = {
    enqueueCleanup: async (paths) => {
      if (cleanupQueueFailure) throw new Error("cleanup queue unavailable");
      queuedFiles.push(...paths);
    },
  };
  const search = {
    removeCandidate: async (candidateId, transactionManager) => {
      searchRemovals.push({ candidateId, transactionManager });
    },
  };

  return {
    processor: new CandidateDeletionProcessor(dataSource, storage, search),
    statements,
    queuedFiles,
    searchRemovals,
    manager,
  };
}

test("candidate deletion stays retryable when private-file cleanup cannot be queued", async () => {
  const { processor, statements, searchRemovals } = createProcessor({
    cleanupQueueFailure: true,
  });

  await assert.rejects(
    processor.processOneDueRequest(),
    /cleanup queue unavailable/,
  );

  assert.equal(
    statements.some(({ sql }) => sql.includes("SET status = 'completed'")),
    false,
  );
  assert.deepEqual(searchRemovals, []);
});

test("candidate deletion queues private-file cleanup and removes the search index", async () => {
  const { processor, statements, queuedFiles, searchRemovals, manager } =
    createProcessor();

  await processor.processOneDueRequest();

  assert.deepEqual(queuedFiles, ["7/resume/resume.pdf"]);
  assert.equal(
    statements.some(({ sql }) => sql.includes("UPDATE candidate_applications")),
    true,
  );
  assert.equal(
    statements.some(({ sql }) => sql.includes("UPDATE payment_invoices")),
    true,
  );
  assert.equal(
    statements.some(({ sql }) => sql.includes("SET email = $2")),
    true,
  );
  assert.equal(
    statements.some(({ sql }) => sql.includes("SET status = 'completed'")),
    true,
  );
  assert.deepEqual(searchRemovals, [
    { candidateId: 7, transactionManager: manager },
  ]);
});
