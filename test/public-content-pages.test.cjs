const assert = require("node:assert/strict");
const { test } = require("node:test");
const { NotFoundException } = require("@nestjs/common");
const {
  PublicContentPagesController,
} = require("../dist/content/public-content-pages.controller.js");
const {
  PublicJobPagesController,
} = require("../dist/jobs/public-job-pages.controller.js");
const { ContentType } = require("../dist/content/content-entry.entity.js");

test("public content pages escape editable text and publish canonical metadata", async () => {
  const previousOrigin = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://example.test/";
  let html = "";
  const response = {
    type(value) {
      assert.equal(value, "text/html");
      return this;
    },
    set(name, value) {
      assert.equal(name, "Cache-Control");
      assert.match(value, /max-age=300/);
      return this;
    },
    send(value) {
      html = value;
      return this;
    },
  };
  const controller = new PublicContentPagesController({
    findPublished: async () => ({
      type: ContentType.PAGE,
      slug: "about",
      title: "<script>alert(1)</script>",
      summary: "A & B",
      body: "<img src=x onerror=alert(1)>",
      seoTitle: null,
      seoDescription: null,
    }),
  });

  try {
    await controller.show("about", response);
    assert.match(html, /https:\/\/example\.test\/pages\/about/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  } finally {
    if (previousOrigin === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousOrigin;
  }
});

test("FAQ items are not served from the indexable content-page route", async () => {
  const controller = new PublicContentPagesController({
    findPublished: async () => ({
      type: ContentType.FAQ,
      slug: "account-help",
    }),
  });

  await assert.rejects(controller.show("account-help", {}), NotFoundException);
});

test("sitemap includes canonical URLs for published page and blog entries", async () => {
  const previousOrigin = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://example.test";
  const contentConditions = [];
  const query = (items, conditions = []) => ({
    select() {
      return this;
    },
    where(condition) {
      conditions.push(condition);
      return this;
    },
    andWhere(condition) {
      conditions.push(condition);
      return this;
    },
    orderBy() {
      return this;
    },
    addOrderBy() {
      return this;
    },
    take() {
      return this;
    },
    getMany: async () => items,
  });
  let sitemap = "";
  const controller = new PublicJobPagesController(
    {
      jobOptions: async () => ({
        categories: ["Engineering"],
        locations: ["Bengaluru"],
      }),
    },
    {
      createQueryBuilder: () =>
        query([
          {
            id: 15,
            createdAt: new Date("2026-01-03T00:00:00Z"),
            category: "Engineering",
            location: "Bengaluru",
            workplaceType: "onsite",
          },
        ]),
    },
    {
      createQueryBuilder: () =>
        query(
          [
            {
              slug: "about-us",
              updatedAt: new Date("2026-01-02T00:00:00Z"),
            },
            {
              slug: "news",
              updatedAt: new Date("2026-01-03T00:00:00Z"),
            },
          ],
          contentConditions,
        ),
    },
  );
  const response = {
    type: () => response,
    set: () => response,
    send(value) {
      sitemap = value;
      return response;
    },
  };

  try {
    await controller.sitemap(response);
    assert.match(sitemap, /https:\/\/example\.test\/pages\/about-us/);
    assert.match(sitemap, /https:\/\/example\.test\/pages\/news/);
    assert.match(
      sitemap,
      /https:\/\/example\.test\/jobs\/categories\/engineering/,
    );
    assert.match(
      sitemap,
      /https:\/\/example\.test\/jobs\/locations\/bengaluru/,
    );
    assert.ok(
      contentConditions.some((condition) =>
        condition.includes("content.type IN"),
      ),
    );
    assert.ok(
      contentConditions.some((condition) =>
        condition.includes("content.publishedAt <= CURRENT_TIMESTAMP"),
      ),
    );
  } finally {
    if (previousOrigin === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousOrigin;
  }
});

test("category landing renders configured values and escapes published job content", async () => {
  const previousOrigin = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://example.test";
  let searchFilters;
  let html = "";
  const controller = new PublicJobPagesController(
    {
      jobOptions: async () => ({
        categories: ["<script>"],
        locations: ["Remote"],
      }),
      findAll: async (filters) => {
        searchFilters = filters;
        return {
          total: 1,
          items: [
            {
              id: 21,
              title: "<Engineer>",
              company: "Example & Co",
              location: "Pune",
              workplaceType: "remote",
            },
          ],
        };
      },
    },
    {},
    {},
  );
  const response = {
    type: () => response,
    set: () => response,
    send(value) {
      html = value;
      return response;
    },
  };

  try {
    await controller.categoryLanding("script", response);
    assert.deepEqual(searchFilters, {
      category: "<script>",
      page: 1,
      limit: 50,
      sort: "newest",
    });
    assert.match(html, /\/jobs\/categories\/script/);
    assert.match(html, /&lt;Engineer&gt;/);
    assert.match(html, /Example &amp; Co/);
    assert.doesNotMatch(html, /<Engineer>/);
  } finally {
    if (previousOrigin === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousOrigin;
  }
});

test("remote location landing filters by remote workplace type", async () => {
  const previousOrigin = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://example.test";
  let searchFilters;
  const controller = new PublicJobPagesController(
    {
      jobOptions: async () => ({
        categories: [],
        locations: ["Remote"],
      }),
      findAll: async (filters) => {
        searchFilters = filters;
        return { total: 0, items: [] };
      },
    },
    {},
    {},
  );
  const response = {
    type: () => response,
    set: () => response,
    send: () => response,
  };

  try {
    await controller.locationLanding("remote", response);
    assert.deepEqual(searchFilters, {
      workplaceType: "remote",
      page: 1,
      limit: 50,
      sort: "newest",
    });
  } finally {
    if (previousOrigin === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousOrigin;
  }
});
