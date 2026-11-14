const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ServiceUnavailableException } = require("@nestjs/common");
const { HealthController } = require("../dist/health.controller.js");

test("liveness does not depend on database availability", () => {
  const controller = new HealthController({ isInitialized: false });

  assert.deepEqual(controller.getLiveness(), { status: "ok" });
});

test("readiness reports the database check when the database is available", async () => {
  const queries = [];
  const controller = new HealthController({
    isInitialized: true,
    async query(sql) {
      queries.push(sql);
    },
  });

  assert.deepEqual(await controller.getReadiness(), {
    status: "ready",
    checks: { database: "ok" },
  });
  assert.deepEqual(queries, ["SELECT 1"]);
});

test("readiness returns service unavailable when the database is not initialized", async () => {
  const controller = new HealthController({ isInitialized: false });

  await assert.rejects(controller.getReadiness(), ServiceUnavailableException);
});

test("readiness returns service unavailable when the database probe fails", async () => {
  const controller = new HealthController({
    isInitialized: true,
    async query() {
      throw new Error("database credentials must not be returned");
    },
  });

  await assert.rejects(controller.getReadiness(), ServiceUnavailableException);
});
