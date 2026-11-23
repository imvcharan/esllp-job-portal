const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ServiceUnavailableException } = require("@nestjs/common");
const {
  PublicCompanyPagesController,
} = require("../dist/employers/public-company-pages.controller.js");

const createController = () =>
  new PublicCompanyPagesController(
    {
      findOneBy: async () => ({
        id: 12,
        slug: "example-company",
        name: "Example Company",
        description: "An example organization.",
        industry: "Technology",
        companySize: null,
        website: null,
      }),
    },
    { find: async () => [] },
    {
      createQueryBuilder: () => {
        const query = {
          where: () => query,
          andWhere: () => query,
          orderBy: () => query,
          take: () => query,
          getMany: async () => [],
        };
        return query;
      },
    },
  );

const createResponse = (onSend) => ({
  type() {
    return this;
  },
  set() {
    return this;
  },
  send(value) {
    return onSend(value);
  },
});

test("company profile renders canonical metadata and organization structured data", async () => {
  const previousOrigin = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://example.test/";
  let html = "";

  try {
    await createController().bySlug(
      "example-company",
      createResponse((value) => {
        html = value;
      }),
    );
    assert.match(
      html,
      /<link rel="canonical" href="https:\/\/example\.test\/companies\/example-company">/,
    );
    assert.match(html, /"@type":"Organization"/);
    assert.match(html, /Example Company/);
  } finally {
    if (previousOrigin === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousOrigin;
  }
});

test("company profile refuses to emit a broken canonical URL without PUBLIC_APP_URL", async () => {
  const previousOrigin = process.env.PUBLIC_APP_URL;
  delete process.env.PUBLIC_APP_URL;

  try {
    await assert.rejects(
      createController().bySlug(
        "example-company",
        createResponse(() => {}),
      ),
      ServiceUnavailableException,
    );
  } finally {
    if (previousOrigin !== undefined) {
      process.env.PUBLIC_APP_URL = previousOrigin;
    }
  }
});
