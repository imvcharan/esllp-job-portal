const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const {
  SeedDefaultFaqAndBlogContent1729000000051,
} = require("../dist/database/migrations/1729000000051-SeedDefaultFaqAndBlogContent.js");

test("default FAQ and blog content is published and does not overwrite existing slugs", async () => {
  let sql = "";
  let parameters = [];
  await new SeedDefaultFaqAndBlogContent1729000000051().up({
    query: async (statement, values) => {
      sql = statement;
      parameters = values;
    },
  });

  assert.match(sql, /ON CONFLICT \(slug\) DO NOTHING/);
  assert.match(sql, /TRUE,\s*NOW\(\),\s*NULL,\s*NULL/);
  assert.equal(parameters.length % 7, 0);

  const entries = [];
  for (let index = 0; index < parameters.length; index += 7) {
    entries.push(parameters.slice(index, index + 7));
  }
  assert.equal(entries.filter(([type]) => type === "faq").length, 6);
  assert.equal(entries.filter(([type]) => type === "blog").length, 3);
  assert.ok(entries.every((entry) => entry[1] && entry[2] && entry[4]));

  const appModule = readFileSync("src/app.module.ts", "utf8");
  assert.match(
    appModule,
    /migrations:\s*\[[\s\S]*SeedDefaultFaqAndBlogContent1729000000051,/,
  );
});

test("rolling back the starter-content migration does not delete editable content", async () => {
  let executedQuery = false;
  await new SeedDefaultFaqAndBlogContent1729000000051().down({
    query: async () => {
      executedQuery = true;
    },
  });
  assert.equal(executedQuery, false);
});
