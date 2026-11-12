const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidateInterviewsService,
} = require("../dist/users/candidate-interviews.service.js");

test("candidate interview list is scoped to the signed-in candidate and excludes employer notes", async () => {
  const conditions = [];
  const interview = {
    id: 12,
    startsAt: new Date("2026-12-01T10:00:00Z"),
    durationMinutes: 45,
    location: "Video call",
    meetingUrl: "https://meet.example.test/room",
    status: "scheduled",
    notes: "Internal hiring notes",
    createdAt: new Date("2026-11-12T10:00:00Z"),
    application: {
      userId: 7,
      job: { id: 3, title: "Engineer", company: "Example" },
    },
  };
  const query = {
    innerJoinAndSelect() {
      return this;
    },
    where(expression, values) {
      conditions.push({ expression, values });
      return this;
    },
    orderBy() {
      return this;
    },
    addOrderBy() {
      return this;
    },
    getMany: async () => [interview],
  };
  const service = new CandidateInterviewsService({
    createQueryBuilder: () => query,
  });
  const result = await service.listForCandidate({ id: 7 });

  assert.deepEqual(conditions[0].values, { userId: 7 });
  assert.equal(result.items[0].job.title, "Engineer");
  assert.equal(result.items[0].meetingUrl, interview.meetingUrl);
  assert.equal("notes" in result.items[0], false);
});
