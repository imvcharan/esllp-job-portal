require("reflect-metadata");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EmailDeliveryService } = require("../dist/auth/email-delivery.service.js");
const { JobQueueService } = require("../dist/infrastructure/job-queue.service.js");

test("EmailDeliveryService resolves its optional queue dependency at runtime", () => {
  const index = 2;
  const injection = (
    Reflect.getMetadata("self:paramtypes", EmailDeliveryService) || []
  ).find((item) => item.index === index);
  const optional =
    Reflect.getMetadata("optional:paramtypes", EmailDeliveryService) || [];

  assert.equal(injection?.param, JobQueueService);
  assert.ok(optional.includes(index));
});
