const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  auditRequestContext,
} = require("../dist/audit/audit-request-context.js");
const {
  createRequestContextMiddleware,
} = require("../dist/audit/request-context.middleware.js");

test("request middleware creates a correlation ID and stores request metadata", () => {
  const headers = {};
  const request = {
    ip: "127.0.0.1",
    get(name) {
      return name === "user-agent" ? "test-agent" : undefined;
    },
    headers: { "x-request-id": "untrusted-client-value" },
  };
  const response = {
    statusCode: 200,
    once(event, callback) {
      if (event === "finish") this.finish = callback;
    },
    setHeader(name, value) {
      headers[name] = value;
    },
  };
  const logs = [];
  let context;

  request.method = "GET";
  request.baseUrl = "/api";
  request.route = { path: "/jobs/:id" };
  request.originalUrl = "/api/jobs/42?token=must-not-be-logged";

  createRequestContextMiddleware({
    log(message) {
      logs.push(message);
    },
  })(request, response, () => {
    context = auditRequestContext.getStore();
  });
  response.finish();

  assert.match(
    headers["X-Request-Id"],
    /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i,
  );
  assert.equal(context.requestId, headers["X-Request-Id"]);
  assert.equal(context.ipAddress, "127.0.0.1");
  assert.equal(context.userAgent, "test-agent");
  assert.notEqual(context.requestId, "untrusted-client-value");
  const logRecord = JSON.parse(logs[0]);
  assert.equal(logRecord.event, "http.request");
  assert.equal(logRecord.requestId, context.requestId);
  assert.equal(logRecord.method, "GET");
  assert.equal(logRecord.route, "/api/jobs/:id");
  assert.equal(logRecord.statusCode, 200);
  assert.ok(logRecord.durationMs >= 0);
  assert.doesNotMatch(logRecord.route, /\b42\b|must-not-be-logged/);
  assert.equal(Object.hasOwn(logRecord, "originalUrl"), false);
});
