const assert = require("node:assert/strict");
const { plainToInstance } = require("class-transformer");
const { validate } = require("class-validator");
const { test } = require("node:test");
const { NotFoundException } = require("@nestjs/common");
const { ContentService } = require("../dist/content/content.service.js");
const {
  ContentEntry,
  ContentType,
} = require("../dist/content/content-entry.entity.js");
const { ContentEntryRevision } = require("../dist/content/content-entry-revision.entity.js");
const { CreateContentEntryDto } = require("../dist/content/dto/create-content-entry.dto.js");

function createService(initial = []) {
  const entries = initial;
  const revisions = [];
  const audits = [];
  const repository = {
    create: (entry) => ({ ...entry }),
    find: async (query) => {
      repository.lastFind = query;
      return entries;
    },
    findOne: async (query) => {
      repository.lastFindOne = query;
      if (query.where.id !== undefined) {
        return entries.find((entry) => entry.id === query.where.id) || null;
      }
      return entries.find(
        (entry) =>
          entry.slug === query.where.slug &&
          entry.isPublished &&
          entry.publishedAt instanceof Date &&
          entry.publishedAt <= query.where.publishedAt._value,
      ) || null;
    },
    findOneBy: async ({ id }) =>
      entries.find((entry) => entry.id === id) || null,
    save: async (entry) => {
      const saved = {
        ...entry,
        id: entry.id || Math.max(0, ...entries.map((item) => item.id || 0)) + 1,
      };
      const index = entries.findIndex((item) => item.id === saved.id);
      if (index >= 0) entries[index] = saved;
      else entries.push(saved);
      return saved;
    },
  };
  const revisionsRepository = {
    create: (revision) => ({ ...revision }),
    find: async ({ where }) =>
      revisions
        .filter((revision) => revision.contentEntryId === where.contentEntryId)
        .sort((left, right) => right.version - left.version)
        .slice(0, 100),
    findOne: async ({ where }) =>
      revisions
        .filter((revision) => revision.contentEntryId === where.contentEntryId)
        .sort((left, right) => right.version - left.version)[0] || null,
    findOneBy: async ({ id, contentEntryId }) =>
      revisions.find(
        (revision) =>
          revision.id === id && revision.contentEntryId === contentEntryId,
      ) || null,
    save: async (revision) => {
      const saved = {
        ...revision,
        id: revision.id || revisions.length + 1,
        createdAt: revision.createdAt || new Date(),
      };
      revisions.push(saved);
      return saved;
    },
  };
  const manager = {
    getRepository: (entity) =>
      entity === ContentEntry ? repository : revisionsRepository,
  };
  const dataSource = {
    transaction: async (callback) => callback(manager),
  };
  const service = new ContentService(
    repository,
    revisionsRepository,
    dataSource,
    {
      record: async (event, transactionManager) =>
        audits.push({ event, transactionManager }),
    },
  );
  return { service, entries, revisions, audits, repository, manager };
}

test("content DTO accepts ISO publication times and rejects malformed times", async () => {
  const valid = plainToInstance(CreateContentEntryDto, {
    type: ContentType.PAGE,
    slug: "scheduled-page",
    title: "Scheduled page",
    body: "Content.",
    isPublished: true,
    publishAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.deepEqual(await validate(valid), []);

  const invalid = plainToInstance(CreateContentEntryDto, {
    type: ContentType.PAGE,
    slug: "scheduled-page",
    title: "Scheduled page",
    body: "Content.",
    isPublished: true,
    publishAt: "tomorrow",
  });
  assert.ok((await validate(invalid)).some((error) => error.property === "publishAt"));
});

test("public content queries filter drafts and optional content type", async () => {
  const { service, repository } = createService();
  await service.listPublished(ContentType.FAQ);
  assert.equal(repository.lastFind.where.type, ContentType.FAQ);
  assert.equal(repository.lastFind.where.isPublished, true);
  assert.equal(
    repository.lastFind.where.publishedAt._type,
    "lessThanOrEqual",
  );
  await service.listPublished();
  assert.equal(repository.lastFind.where.isPublished, true);
  assert.equal(repository.lastFind.where.publishedAt._type, "lessThanOrEqual");
  assert.equal(repository.lastFind.take, 100);
});

test("unpublished content is not available by public slug", async () => {
  const { service } = createService([
    { id: 1, slug: "draft-policy", isPublished: false },
  ]);
  await assert.rejects(
    service.findPublished("draft-policy"),
    NotFoundException,
  );
});

test("content publishing timestamps and audit records track editorial changes", async () => {
  const { service, entries, revisions, audits, manager } = createService();
  const draft = await service.create(7, {
    type: ContentType.PAGE,
    slug: "about-us",
    title: "About us",
    body: "First paragraph.",
  });
  assert.equal(draft.isPublished, false);
  assert.equal(draft.publishedAt, null);
  assert.equal(audits[0].event.actorUserId, 7);
  assert.equal(audits[0].event.action, "content.create");

  const published = await service.update(7, draft.id, { isPublished: true });
  assert.equal(published.isPublished, true);
  assert.ok(published.publishedAt instanceof Date);
  const unpublished = await service.update(7, draft.id, { isPublished: false });
  assert.equal(unpublished.isPublished, false);
  assert.equal(unpublished.publishedAt, null);
  assert.equal(audits.length, 3);
  assert.deepEqual(
    revisions.map((revision) => revision.version),
    [1, 2, 3],
  );
  assert.ok(audits.every((audit) => audit.transactionManager === manager));
  assert.equal(entries[0].slug, "about-us");
});

test("scheduled content stays hidden until its publication time", async () => {
  const { service, entries, audits, repository } = createService();
  const publishAt = new Date(Date.now() + 60_000).toISOString();
  const scheduled = await service.create(7, {
    type: ContentType.PAGE,
    slug: "launch-announcement",
    title: "Launch announcement",
    body: "Coming soon.",
    isPublished: true,
    publishAt,
  });

  assert.equal(scheduled.publishedAt.toISOString(), publishAt);
  assert.equal(audits[0].event.details.scheduledAt, publishAt);
  await assert.rejects(
    service.findPublished("launch-announcement"),
    NotFoundException,
  );
  assert.equal(
    repository.lastFindOne.where.publishedAt._type,
    "lessThanOrEqual",
  );
  assert.ok(
    repository.lastFindOne.where.publishedAt._value < scheduled.publishedAt,
  );
  assert.equal(entries.length, 1);
});

test("content history is scoped to its item and restores as a new audited revision", async () => {
  const { service, entries, revisions, audits } = createService();
  const original = await service.create(7, {
    type: ContentType.PAGE,
    slug: "team",
    title: "Our team",
    body: "Original copy.",
  });
  const revised = await service.update(8, original.id, {
    title: "Meet the team",
    body: "Updated copy.",
  });
  const history = await service.listRevisions(original.id);
  assert.deepEqual(history.map((revision) => revision.version), [2, 1]);
  assert.equal(history[0].title, revised.title);

  const restored = await service.restoreRevision(
    9,
    original.id,
    history[1].id,
  );
  assert.equal(restored.title, "Our team");
  assert.equal(restored.body, "Original copy.");
  assert.equal(entries[0].title, "Our team");
  assert.deepEqual(
    revisions.map((revision) => revision.version),
    [1, 2, 3],
  );
  assert.equal(audits.at(-1).event.action, "content.restore");
  assert.equal(audits.at(-1).event.actorUserId, 9);
});

test("content history cannot restore a revision belonging to another item", async () => {
  const { service } = createService();
  const first = await service.create(7, {
    type: ContentType.PAGE,
    slug: "first",
    title: "First page",
    body: "First.",
  });
  const second = await service.create(7, {
    type: ContentType.PAGE,
    slug: "second",
    title: "Second page",
    body: "Second.",
  });
  const firstRevision = (await service.listRevisions(first.id))[0];
  await assert.rejects(
    service.restoreRevision(7, second.id, firstRevision.id),
    /Content revision not found/,
  );
});

test("editing scheduled content can publish it now without resetting a live item's original date", async () => {
  const publishedAt = new Date(Date.now() - 60_000);
  const { service, entries } = createService([
    {
      id: 1,
      type: ContentType.PAGE,
      slug: "live-page",
      title: "Live page",
      body: "Existing content.",
      isPublished: true,
      publishedAt,
    },
    {
      id: 2,
      type: ContentType.PAGE,
      slug: "scheduled-page",
      title: "Scheduled page",
      body: "Future content.",
      isPublished: true,
      publishedAt: new Date(Date.now() + 60_000),
    },
  ]);
  const live = await service.update(7, 1, {
    title: "Updated live page",
    isPublished: true,
    publishAt: null,
  });
  assert.equal(live.publishedAt, publishedAt);

  const scheduled = await service.update(7, 2, {
    isPublished: true,
    publishAt: null,
  });
  assert.ok(scheduled.publishedAt.getTime() <= Date.now());
  assert.equal(entries[1].publishedAt, scheduled.publishedAt);
});

test("unpublished content cannot carry a future publication timestamp", async () => {
  const { service } = createService();
  await assert.rejects(
    service.create(7, {
      type: ContentType.PAGE,
      slug: "invalid-schedule",
      title: "Invalid schedule",
      body: "Draft.",
      isPublished: false,
      publishAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    /must be marked published/,
  );
});
