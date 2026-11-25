require("reflect-metadata");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { getMetadataArgsStorage } = require("typeorm");

test("registered entities do not infer unsupported Object or Function column types", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";
  try {
    require("../dist/app.module.js");
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }

  const unsupported = getMetadataArgsStorage()
    .columns.filter((column) => {
      const type =
        column.options.type ||
        Reflect.getMetadata(
          "design:type",
          column.target.prototype,
          column.propertyName,
        );
      return type === Object || type === Function;
    })
    .map((column) => `${column.target.name}.${column.propertyName}`);

  assert.deepEqual(unsupported, []);
});
