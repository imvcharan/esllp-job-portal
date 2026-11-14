const assert = require("node:assert/strict");
const { test } = require("node:test");
const { AuditService } = require("../dist/audit/audit.service.js");
const {
  auditRequestContext,
} = require("../dist/audit/audit-request-context.js");

test("audit records retain the request correlation ID", async () => {
  let saved;
  const repository = {
    create(value) {
      return value;
    },
    async save(value) {
      saved = value;
      return value;
    },
  };
  const service = new AuditService(repository, {}, { lookup: () => null });

  await auditRequestContext.run(
    {
      requestId: "1e3526e7-9e90-4721-9af7-b6e684f6066b",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
    },
    () =>
      service.record({
        actorUserId: 7,
        action: "test.action",
        targetType: "test",
        targetId: 1,
      }),
  );

  assert.equal(saved.requestId, "1e3526e7-9e90-4721-9af7-b6e684f6066b");
});

test("audit search can find events by request correlation ID", async () => {
  const calls = [];
  const builder = {
    leftJoin(...args) {
      calls.push(["leftJoin", ...args]);
      return this;
    },
    orderBy(...args) {
      calls.push(["orderBy", ...args]);
      return this;
    },
    addOrderBy(...args) {
      calls.push(["addOrderBy", ...args]);
      return this;
    },
    andWhere(...args) {
      calls.push(["andWhere", ...args]);
      return this;
    },
    skip() {
      return this;
    },
    take() {
      return this;
    },
    async getManyAndCount() {
      return [[], 0];
    },
  };
  const service = new AuditService(
    { createQueryBuilder: () => builder },
    {},
    { lookup: () => null },
  );

  await service.list(1, 50, { query: "1e3526e7-9e90-4721-9af7-b6e684f6066b" });

  assert.ok(
    calls.some(
      ([method, sql]) =>
        method === "andWhere" &&
        sql.includes("CAST(audit.requestId AS text) ILIKE :search"),
    ),
  );
});
