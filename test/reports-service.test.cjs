const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ConflictException, BadRequestException } = require("@nestjs/common");
const { ReportsService } = require("../dist/reports/reports.service.js");
const {
  ReportStatus,
  ReportTargetType,
} = require("../dist/reports/report.entity.js");

function createService(report = null) {
  const audits = [];
  const repository = {
    create: (value) => ({ ...value }),
    findOneBy: async () => report,
    save: async (value) => Object.assign(value, { id: value.id || 11 }),
    findAndCount: async () => [[], 0],
  };
  const service = new ReportsService(
    repository,
    { findOneBy: async () => ({ id: 4 }) },
    { findOneBy: async () => ({ id: 4 }) },
    { findOneBy: async () => ({ id: 4, isActive: true }) },
    { record: async (entry) => audits.push(entry) },
  );
  return { service, audits };
}

test("report submission trims details and records a moderation audit event", async () => {
  const { service, audits } = createService();
  const result = await service.create(
    { id: 2 },
    {
      targetType: ReportTargetType.JOB,
      targetId: 4,
      reason: "misleading",
      details: "  Salary is not accurate.  ",
    },
  );

  assert.deepEqual(result, { id: 11, status: ReportStatus.OPEN });
  assert.equal(audits[0].action, "report.created");
  assert.equal(audits[0].details.reportId, 11);
});

test("a reporter cannot create a second open report for the same target", async () => {
  const existing = { id: 9, status: ReportStatus.OPEN };
  const { service } = createService(existing);

  await assert.rejects(
    service.create(
      { id: 2 },
      {
        targetType: ReportTargetType.JOB,
        targetId: 4,
        reason: "spam",
      },
    ),
    ConflictException,
  );
});

test("moderators must start review before recording a report action", async () => {
  const report = {
    id: 9,
    targetType: ReportTargetType.JOB,
    targetId: 4,
    status: ReportStatus.OPEN,
  };
  const { service } = createService(report);

  await assert.rejects(
    service.update(9, { status: ReportStatus.ACTIONED }, { id: 3 }),
    BadRequestException,
  );
  await service.update(9, { status: ReportStatus.REVIEWING }, { id: 3 });
  const updated = await service.update(
    9,
    { status: ReportStatus.ACTIONED, resolutionNote: "Listing corrected." },
    { id: 3 },
  );
  assert.equal(updated.status, ReportStatus.ACTIONED);
  assert.equal(updated.resolutionNote, "Listing corrected.");
});

test("moderation queue enriches reports with target labels and bounds pagination", async () => {
  const report = {
    id: 10,
    targetType: ReportTargetType.JOB,
    targetId: 4,
    status: ReportStatus.OPEN,
  };
  const service = new ReportsService(
    {
      findAndCount: async () => [[report], 26],
    },
    {
      find: async () => [{ id: 4, title: "Engineer", company: "Example" }],
    },
    { find: async () => [] },
    { find: async () => [] },
    { record: async () => undefined },
  );

  const result = await service.list(2, 25);

  assert.equal(result.page, 2);
  assert.equal(result.limit, 25);
  assert.equal(result.items[0].target.label, "Engineer · Example");
  assert.equal(result.total, 26);
});
