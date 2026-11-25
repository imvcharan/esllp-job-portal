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
    checks: {
      database: "ok",
      redisCache: "optional_unavailable",
      bullMq: "optional_unavailable",
      openSearch: "optional_unavailable",
    },
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

test("metrics require a bearer token and omit database credentials", async () => {
  const previous = process.env.METRICS_BEARER_TOKEN;
  const token = "test-metrics-token-with-at-least-32-characters";
  process.env.METRICS_BEARER_TOKEN = token;
  const controller = new HealthController({
    isInitialized: false,
    async query() {
      return [];
    },
  });
  let metrics;
  try {
    metrics = await controller.getMetrics({
      get: () => `Bearer ${token}`,
    });
  } finally {
    if (previous === undefined) delete process.env.METRICS_BEARER_TOKEN;
    else process.env.METRICS_BEARER_TOKEN = previous;
  }

  assert.equal(metrics.status, "ok");
  assert.equal(typeof metrics.uptimeSeconds, "number");
  assert.equal(metrics.process.pid, process.pid);
  assert.equal(metrics.process.node, process.version);
  assert.equal(typeof metrics.memory.rssBytes, "number");
  assert.equal(typeof metrics.memory.heapUsedBytes, "number");
  assert.equal(JSON.stringify(metrics).includes(token), false);
});
