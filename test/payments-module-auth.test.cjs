require("reflect-metadata");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { AuthModule } = require("../dist/auth/auth.module.js");
const { PaymentsModule } = require("../dist/payments/payments.module.js");

test("PaymentsModule imports AuthModule for its protected controllers", () => {
  const imports = Reflect.getMetadata("imports", PaymentsModule) || [];
  assert.ok(imports.includes(AuthModule));
});
