const assert = require("node:assert/strict");
const { test } = require("node:test");
const { plainToInstance } = require("class-transformer");
const { validate } = require("class-validator");
const { EmployersService } = require("../dist/employers/employers.service.js");
const {
  CreateEmployerNoteDto,
  EmployerApplicantsQueryDto,
  EmployerTagDto,
} = require("../dist/employers/dto/employer-workflow.dto.js");
const {
  CandidateApplicationMessage,
} = require("../dist/users/candidate-application-message.entity.js");
const {
  UserNotification,
} = require("../dist/employers/user-notification.entity.js");
const {
  UpdateEmployerSavedSearchDto,
} = require("../dist/employers/dto/update-employer-saved-search.dto.js");

function createApplicantsService() {
  const calls = [];
  const builder = {
    innerJoinAndSelect(...args) {
      calls.push(["innerJoinAndSelect", ...args]);
      return this;
    },
    leftJoinAndSelect(...args) {
      calls.push(["leftJoinAndSelect", ...args]);
      return this;
    },
    where(...args) {
      calls.push(["where", ...args]);
      return this;
    },
    andWhere(...args) {
      calls.push(["andWhere", ...args]);
      return this;
    },
    orderBy(...args) {
      calls.push(["orderBy", ...args]);
      return this;
    },
    addOrderBy(...args) {
      calls.push(["addOrderBy", ...args]);
      return this;
    },
    skip(...args) {
      calls.push(["skip", ...args]);
      return this;
    },
    take(...args) {
      calls.push(["take", ...args]);
      return this;
    },
    async getManyAndCount() {
      return [[], 0];
    },
  };
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization: { id: 21 },
    membership: { role: "recruiter" },
  });
  service.requireRole = () => undefined;
  service.platformConfiguration = {
    get: async () => ({
      applicationStages: [
        { key: "submitted", transitions: ["in_review"] },
        { key: "in_review", transitions: ["rejected"] },
        { key: "rejected", transitions: [] },
      ],
    }),
  };
  service.applications = { createQueryBuilder: () => builder };
  service.messages = {};
  service.applicationStatuses = {};
  service.notes = {};
  service.tags = {};
  service.interviews = {};
  service.offers = {};
  service.scorecards = {};
  service.applicationDocuments = {};
  service.fileStorage = { scanStatuses: async () => new Map() };
  service.auditService = { record: async () => undefined };
  return { service, calls };
}

test("applicant filters validate stages and apply tag, assignee, sorting, and literal search terms", async () => {
  const { service, calls } = createApplicantsService();

  await service.listApplicants(
    { id: 7 },
    {
      q: "R&D _lead%",
      status: "submitted",
      assignee: "unassigned",
      tag: "Strong",
      from: "2026-01-01",
      to: "2026-01-31",
      sort: "oldest",
    },
  );

  assert.ok(
    calls.some(
      ([method, expression, parameters]) =>
        method === "andWhere" &&
        expression.includes("assignedToUserId IS NULL"),
    ),
  );
  assert.ok(
    calls.some(
      ([method, expression, parameters]) =>
        method === "andWhere" &&
        expression.includes("filter_tag.label = :tag") &&
        parameters.tag === "strong",
    ),
  );
  const searchPredicates = calls.filter(
    ([method, , parameters]) =>
      method === "andWhere" &&
      parameters &&
      Object.keys(parameters).some((key) => key.startsWith("applicantSearch")),
  );
  assert.equal(searchPredicates.length, 2, JSON.stringify(searchPredicates));
  assert.match(searchPredicates[0][1], /application\.profileSnapshot::text/);
  assert.equal(searchPredicates[0][2].applicantSearch0, "%R&D%");
  assert.equal(searchPredicates[1][2].applicantSearch1, "%\\_lead\\%%");
  assert.deepEqual(
    calls.find(([method]) => method === "orderBy"),
    ["orderBy", "application.createdAt", "ASC"],
  );
  assert.ok(
    calls.some(
      ([method, expression, parameters]) =>
        method === "andWhere" &&
        expression === "application.createdAt >= :appliedFrom" &&
        parameters.appliedFrom instanceof Date,
    ),
  );
  await assert.rejects(
    service.listApplicants({ id: 7 }, { from: "2026-02-01", to: "2026-01-31" }),
    /start date must not follow/i,
  );

  await assert.rejects(
    service.listApplicants({ id: 7 }, { status: "not_a_stage" }),
    /Choose a valid application status/,
  );
});

test("blank internal notes and tags are rejected after trimming", async () => {
  const service = Object.create(EmployersService.prototype);
  let noteWrites = 0;
  let tagWrites = 0;
  service.getContext = async () => ({
    organization: { id: 21 },
    membership: { role: "recruiter" },
  });
  service.requireRole = () => undefined;
  service.assertApplicationBelongsToOrganization = async () => undefined;
  service.notes = {
    create: (value) => value,
    save: async (value) => {
      noteWrites += 1;
      return value;
    },
  };
  service.tags = {
    findOneBy: async () => null,
    create: (value) => value,
    save: async (value) => {
      tagWrites += 1;
      return value;
    },
  };

  await assert.rejects(
    service.addApplicationNote({ id: 7 }, 9, { note: "   " }),
    /Write a note before saving it/,
  );
  await assert.rejects(
    service.addApplicationTag({ id: 7 }, 9, " \t "),
    /Enter a non-blank tag/,
  );
  assert.equal(noteWrites, 0);
  assert.equal(tagWrites, 0);
});

test("blank note and tag DTOs fail validation", async () => {
  const noteErrors = await validate(
    plainToInstance(CreateEmployerNoteDto, { note: "   " }),
  );
  const tagErrors = await validate(
    plainToInstance(EmployerTagDto, { label: "   " }),
  );

  assert.notEqual(noteErrors.length, 0);
  assert.notEqual(tagErrors.length, 0);
  assert.notDeepEqual(
    await validate(
      plainToInstance(EmployerApplicantsQueryDto, {
        assignee: "outside",
        sort: "random",
      }),
    ),
    [],
  );
  assert.deepEqual(
    await validate(
      plainToInstance(UpdateEmployerSavedSearchDto, {
        shareWithTeam: true,
      }),
    ),
    [],
  );
});

test("a failed in-app notification rolls back the message and audit together", async () => {
  const committedMessages = [];
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization: { id: 21 },
    membership: { role: "recruiter" },
  });
  service.requireRole = () => undefined;
  service.getApplicationWithCandidate = async () => ({
    userId: 45,
    job: { title: "Engineer" },
  });
  service.auditService = { record: async () => undefined };
  service.dataSource = {
    transaction: async (callback) => {
      const pendingMessages = [];
      const manager = {
        getRepository(entity) {
          if (entity === CandidateApplicationMessage) {
            return {
              create: (value) => value,
              save: async (value) => {
                pendingMessages.push(value);
                return { ...value, id: 3, createdAt: new Date() };
              },
            };
          }
          if (entity === UserNotification) {
            return {
              create: (value) => value,
              save: async () => {
                throw new Error("notification storage unavailable");
              },
            };
          }
          throw new Error("Unexpected repository");
        },
      };
      const result = await callback(manager);
      committedMessages.push(...pendingMessages);
      return result;
    },
  };

  await assert.rejects(
    service.sendApplicationMessage({ id: 7 }, 12, {
      message: "Interview availability?",
    }),
    /notification storage unavailable/,
  );
  assert.deepEqual(committedMessages, []);
});

test("application messages are returned as bounded chronological pages", async () => {
  const service = Object.create(EmployersService.prototype);
  let findOptions;
  service.getContext = async () => ({
    organization: { id: 21 },
    membership: { role: "recruiter" },
  });
  service.requireRole = () => undefined;
  service.assertApplicationBelongsToOrganization = async () => undefined;
  service.messages = {
    findAndCount: async (options) => {
      findOptions = options;
      return [
        [
          {
            id: 25,
            message: "newer",
            senderUserId: 7,
            sender: { displayName: "Recruiter" },
            createdAt: new Date("2026-11-25T10:00:00Z"),
          },
          {
            id: 24,
            message: "older",
            senderUserId: 45,
            sender: { displayName: "Candidate" },
            createdAt: new Date("2026-11-25T09:00:00Z"),
          },
        ],
        60,
      ];
    },
  };

  const result = await service.listApplicationMessages(
    { id: 7 },
    12,
    2,
    25,
    21,
  );

  assert.equal(findOptions.skip, 25);
  assert.equal(findOptions.take, 25);
  assert.deepEqual(
    result.items.map((message) => message.id),
    [24, 25],
  );
  assert.equal(result.hasMore, true);
});
