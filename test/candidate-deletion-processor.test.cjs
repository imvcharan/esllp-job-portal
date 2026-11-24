const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidateDeletionProcessor,
} = require("../dist/users/candidate-deletion-processor.service.js");

function createProcessor({ storageFailure = false } = {}) {
  const statements = [];
  const removedFiles = [];
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
    removeMany: async (paths) => {
      removedFiles.push(...paths);
      if (storageFailure) throw new Error("storage unavailable");
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
    removedFiles,
    searchRemovals,
    manager,
  };
}

test("candidate deletion stays retryable when private-file removal fails", async () => {
  const { processor, statements, searchRemovals } = createProcessor({
    storageFailure: true,
  });

  await assert.rejects(processor.processOneDueRequest(), /storage unavailable/);

  assert.equal(
    statements.some(({ sql }) => sql.includes("SET status = 'completed'")),
    false,
  );
  assert.deepEqual(searchRemovals, []);
});

test("candidate deletion anonymizes account data and queues index removal", async () => {
  const { processor, statements, removedFiles, searchRemovals, manager } =
    createProcessor();

  await processor.processOneDueRequest();

  assert.deepEqual(removedFiles, ["7/resume/resume.pdf"]);
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
