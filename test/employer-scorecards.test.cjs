const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  BadRequestException,
  NotFoundException,
} = require("@nestjs/common");
const { EmployersService } = require("../dist/employers/employers.service.js");

function createService({ organizationId = 21 } = {}) {
  const audits = [];
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization: { id: 21 },
    membership: { role: "recruiter" },
  });
  service.requireRole = () => undefined;
  service.applications = {
    findOne: async () => ({
      id: 5,
      job: { organizationId },
    }),
  };
  service.scorecards = {
    findOneBy: async () => null,
    create: (value) => value,
    save: async (value) => ({ id: 17, ...value }),
  };
  service.auditService = {
    record: async (entry) => audits.push(entry),
  };
  return { service, audits };
}

test("employer scorecard saves private ratings, recommendation, and an audit event", async () => {
  const { service, audits } = createService();
  const saved = await service.saveApplicationScorecard(
    { id: 8 },
    5,
    {
      scores: { Skills: 5, "Role fit": 4 },
      recommendation: "yes",
      notes: "Strong evidence in the interview.",
    },
  );

  assert.equal(saved.organizationId, 21);
  assert.equal(saved.reviewerUserId, 8);
  assert.deepEqual(saved.scores, { Skills: 5, "Role fit": 4 });
  assert.equal(saved.recommendation, "yes");
  assert.equal(audits[0].action, "employer.application_scorecard_saved");
});

test("scorecards reject invalid ratings and applications from other companies", async () => {
  const { service } = createService();
  await assert.rejects(
    service.saveApplicationScorecard(
      { id: 8 },
      5,
      { scores: { Skills: 6 }, recommendation: "yes" },
    ),
    BadRequestException,
  );

  const foreignCompany = createService({ organizationId: 99 });
  await assert.rejects(
    foreignCompany.service.saveApplicationScorecard(
      { id: 8 },
      5,
      { scores: { Skills: 4 }, recommendation: "yes" },
    ),
    NotFoundException,
  );
});
