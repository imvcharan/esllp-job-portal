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

test("candidate interview responses lock the interview and notify only once", async () => {
  const interview = {
    id: 12,
    startsAt: new Date(Date.now() + 60_000),
    status: "scheduled",
    candidateResponse: "pending",
    scheduledByUserId: 9,
    application: {
      userId: 7,
      job: { title: "Engineer" },
    },
  };
  let lockMode;
  const notifications = [];
  const interviewRepository = {
    createQueryBuilder() {
      const query = {
        innerJoinAndSelect() {
          return query;
        },
        where() {
          return query;
        },
        andWhere() {
          return query;
        },
        setLock(mode) {
          lockMode = mode;
          return query;
        },
        getOne: async () => interview,
      };
      return query;
    },
    save: async (entity) => entity,
  };
  const notificationRepository = {
    create: (entity) => entity,
    save: async (entity) => notifications.push(entity),
  };
  const manager = {
    getRepository(entity) {
      return entity.name === "EmployerInterview"
        ? interviewRepository
        : notificationRepository;
    },
  };
  const service = new CandidateInterviewsService({
    manager: {
      transaction: async (callback) => callback(manager),
    },
  });

  assert.deepEqual(
    await service.respond(
      { id: 7, displayName: "Candidate", email: "candidate@example.test" },
      12,
      { response: "accepted" },
    ),
    { success: true, response: "accepted" },
  );
  assert.equal(lockMode, "pessimistic_write");
  assert.equal(interview.candidateResponse, "accepted");
  assert.equal(notifications.length, 1);

  await service.respond({ id: 7 }, 12, { response: "accepted" });
  assert.equal(notifications.length, 1);
  await assert.rejects(
    service.respond({ id: 7 }, 12, { response: "declined" }),
    /already responded/,
  );
});
