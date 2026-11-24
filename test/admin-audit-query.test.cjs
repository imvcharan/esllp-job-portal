const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ValidationPipe } = require("@nestjs/common");
const {
  AdminAuditQueryDto,
} = require("../dist/admin/dto/admin-audit-query.dto.js");

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const queryMetadata = {
  type: "query",
  metatype: AdminAuditQueryDto,
};

async function assertValidationError(value, expectedMessage) {
  await assert.rejects(
    validationPipe.transform(value, queryMetadata),
    (error) =>
      error
        .getResponse()
        .message.some((message) => message.includes(expectedMessage)),
  );
}

test("audit query validation applies defaults and converts bounded pagination", async () => {
  const query = await validationPipe.transform(
    { page: "3", limit: "25", from: "2026-11-01" },
    queryMetadata,
  );

  assert.equal(query.page, 3);
  assert.equal(query.limit, 25);
  assert.equal(query.from, "2026-11-01");

  const defaults = await validationPipe.transform({}, queryMetadata);
  assert.equal(defaults.page, 1);
  assert.equal(defaults.limit, 50);
});

test("audit query validation rejects oversized and malformed filters", async () => {
  await assertValidationError(
    { q: "x".repeat(201) },
    "q must be shorter than or equal to 200 characters",
  );
  await assertValidationError(
    { limit: "101" },
    "limit must not be greater than 100",
  );
  await assert.rejects(
    validationPipe.transform({ from: "2026-02-31" }, queryMetadata),
  );
  await assertValidationError(
    { unexpected: "value" },
    "property unexpected should not exist",
  );
});
