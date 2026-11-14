const assert = require("node:assert/strict");
const { test } = require("node:test");
const { validate } = require("class-validator");
const {
  CandidateApplicationsService,
} = require("../dist/users/candidate-applications.service.js");
const {
  CandidateApplication,
} = require("../dist/users/candidate-application.entity.js");
const {
  CandidateApplicationStatus,
} = require("../dist/users/candidate-application-status.entity.js");
const {
  CandidateApplicationOffer,
} = require("../dist/users/candidate-application-offer.entity.js");
const {
  CandidateApplicationMessage,
} = require("../dist/users/candidate-application-message.entity.js");
const {
  EmployerOrganizationMember,
} = require("../dist/employers/organization-member.entity.js");
const {
  UserNotification,
} = require("../dist/employers/user-notification.entity.js");
const {
  UpdateApplicationStatusDto,
} = require("../dist/users/dto/update-application-status.dto.js");

function createService({
  application,
  offer = null,
  applicationStages = [
    {
      key: "submitted",
      label: "Submitted",
      transitions: ["in_review", "interview", "rejected"],
    },
    {
      key: "in_review",
      label: "In review",
      transitions: ["interview", "rejected"],
    },
    { key: "interview", label: "Interview", transitions: ["rejected"] },
    { key: "rejected", label: "Rejected", transitions: [] },
  ],
}) {
  const histories = [];
  const notifications = [];
  const audits = [];
  const offerRepository = {
    find: async () => (offer ? [offer] : []),
    findOne: async () => offer,
    save: async (value) => value,
  };
  const messageRepository = {
    find: async () => [],
    create: (value) => value,
    save: async (value) => value,
  };
  const applicationRepository = {
    findOne: async () => application,
    findOneBy: async () => application,
    save: async (value) => value,
  };
  const statusRepository = {
    find: async () => histories,
    save: async (value) => {
      const entry = { ...value, createdAt: new Date() };
      histories.push(entry);
      return entry;
    },
  };
  const notificationRepository = {
    create: (value) => value,
    save: async (value) => {
      notifications.push(...(Array.isArray(value) ? value : [value]));
      return value;
    },
  };
  const membersRepository = {
    find: async () => [],
  };
  const repositories = new Map([
    [CandidateApplication, applicationRepository],
    [CandidateApplicationStatus, statusRepository],
    [CandidateApplicationOffer, offerRepository],
    [CandidateApplicationMessage, messageRepository],
    [EmployerOrganizationMember, membersRepository],
    [UserNotification, notificationRepository],
  ]);
  const manager = {
    getRepository: (entity) => repositories.get(entity),
  };
  const dataSource = {
    transaction: async (callback) => callback(manager),
  };
  const service = new CandidateApplicationsService(
    dataSource,
    applicationRepository,
    statusRepository,
    offerRepository,
    messageRepository,
    {},
    {},
    {},
    membersRepository,
    notificationRepository,
    {},
    {},
    { record: async (audit) => audits.push(audit) },
    {
      get: async () => ({ applicationStages }),
    },
  );
  return {
    service,
    application,
    offer,
    histories,
    notifications,
    audits,
    repositories,
  };
}

test("employer status updates use configured stage transitions and labels", async () => {
  const application = {
    id: 31,
    userId: 2,
    jobId: 7,
    status: "phone_screen",
    user: { email: "candidate@example.com" },
    job: {
      id: 7,
      title: "Engineer",
      company: "Example",
      organizationId: 6,
      employerUserId: 9,
    },
  };
  const stages = [
    {
      key: "submitted",
      label: "Submitted",
      transitions: ["in_review", "interview", "rejected"],
    },
    {
      key: "in_review",
      label: "In review",
      transitions: ["interview", "rejected"],
    },
    { key: "interview", label: "Interview", transitions: ["rejected"] },
    { key: "rejected", label: "Rejected", transitions: [] },
    {
      key: "phone_screen",
      label: "Phone screen",
      transitions: ["interview", "rejected"],
    },
  ];
  const setup = createService({ application, applicationStages: stages });
  const queryBuilder = {
    innerJoinAndSelect() { return this; },
    where() { return this; },
    andWhere() { return this; },
    setLock() { return this; },
    getOne: async () => application,
  };
  setup.service.dataSource.transaction = async (callback) =>
    callback({
      getRepository(entity) {
        if (entity === CandidateApplication) {
          return {
            createQueryBuilder: () => queryBuilder,
            save: async (value) => value,
          };
        }
        return setup.repositories.get(entity);
      },
    });
  setup.service.profilesRepository = {
    findOneBy: async () => ({ applicationEmailUpdates: false }),
  };

  await assert.rejects(
    setup.service.updateStatus({ id: 9 }, 31, "submitted", undefined, 6),
    /cannot move from phone_screen to submitted/,
  );
  const result = await setup.service.updateStatus(
    { id: 9 },
    31,
    "interview",
    undefined,
    6,
  );

  assert.equal(result.status, "interview");
  assert.equal(setup.histories[0].fromStatus, "phone_screen");
  assert.equal(setup.histories[0].toStatus, "interview");
  assert.ok(setup.notifications[0].message.includes("now Interview"));
});

test("candidate withdrawal is recorded as a request and not an immediate withdrawal", async () => {
  const application = {
    id: 12,
    userId: 2,
    jobId: 7,
    status: "interview",
    withdrawnAt: null,
    withdrawalRequestedAt: null,
    withdrawalRequestedFromStatus: null,
    job: {
      id: 7,
      title: "Engineer",
      company: "Example",
      location: "Pune",
      isActive: true,
      applicationDeadline: null,
      organizationId: null,
      employerUserId: 9,
    },
  };
  const { service, histories, notifications, audits } = createService({
    application,
  });

  const result = await service.withdraw({ id: 2 }, 12);

  assert.equal(result.status, "withdrawal_requested");
  assert.equal(application.status, "withdrawal_requested");
  assert.equal(application.withdrawnAt, null);
  assert.equal(application.withdrawalRequestedFromStatus, "interview");
  assert.equal(histories[0].toStatus, "withdrawal_requested");
  assert.equal(notifications[0].type, "withdrawal_requested");
  assert.equal(audits[0].action, "candidate.application_withdrawal_requested");
});

test("candidate can request withdrawal from a configured custom stage", async () => {
  const application = {
    id: 12,
    userId: 2,
    jobId: 7,
    status: "phone_screen",
    withdrawnAt: null,
    withdrawalRequestedAt: null,
    withdrawalRequestedFromStatus: null,
    job: {
      id: 7,
      title: "Engineer",
      company: "Example",
      location: "Pune",
      isActive: true,
      applicationDeadline: null,
      organizationId: null,
      employerUserId: 9,
    },
  };
  const { service } = createService({
    application,
    applicationStages: [
      { key: "phone_screen", label: "Phone screen", transitions: ["interview"] },
    ],
  });

  const result = await service.withdraw({ id: 2 }, 12);

  assert.equal(result.status, "withdrawal_requested");
  assert.equal(application.withdrawalRequestedFromStatus, "phone_screen");
});

test("candidate offer response updates the application and notifies the employer", async () => {
  const application = {
    id: 15,
    userId: 2,
    jobId: 7,
    status: "offer",
    job: { id: 7, title: "Engineer", organizationId: null, employerUserId: 9 },
  };
  const offer = {
    applicationId: 15,
    status: "pending",
    expiresAt: new Date(Date.now() + 60_000),
    respondedAt: null,
  };
  const setup = createService({ application, offer });
  const queryBuilder = {
    innerJoinAndSelect() {
      return this;
    },
    where() {
      return this;
    },
    andWhere() {
      return this;
    },
    setLock() {
      return this;
    },
    getOne: async () => application,
  };
  setup.service.dataSource.transaction = async (callback) =>
    callback({
      getRepository(entity) {
        if (entity === CandidateApplication) {
          return {
            createQueryBuilder: () => queryBuilder,
            save: async (value) => value,
          };
        }
        if (entity === CandidateApplicationOffer) {
          return {
            findOne: async () => offer,
            save: async (value) => value,
          };
        }
        return setup.repositories.get(entity);
      },
    });

  const result = await setup.service.respondToOffer({ id: 2 }, 15, "accepted");

  assert.equal(result.status, "offer_accepted");
  assert.equal(application.status, "offer_accepted");
  assert.equal(offer.status, "accepted");
  assert.equal(setup.histories[0].toStatus, "offer_accepted");
  assert.ok(setup.notifications.some((item) => item.type === "offer_response"));
  assert.equal(setup.audits[0].action, "candidate.application_offer_accepted");
});

test("employers can mark an accepted offer as hired and notify the candidate", async () => {
  const application = {
    id: 22,
    userId: 2,
    jobId: 7,
    status: "offer_accepted",
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    user: { email: "candidate@example.com" },
    job: {
      id: 7,
      title: "Engineer",
      company: "Example",
      organizationId: 6,
      employerUserId: 9,
    },
  };
  const setup = createService({ application });
  const queryBuilder = {
    innerJoinAndSelect() { return this; },
    where() { return this; },
    andWhere() { return this; },
    setLock() { return this; },
    getOne: async () => application,
  };
  setup.service.dataSource.transaction = async (callback) =>
    callback({
      getRepository(entity) {
        if (entity === CandidateApplication) {
          return {
            createQueryBuilder: () => queryBuilder,
            save: async (value) => value,
          };
        }
        return setup.repositories.get(entity);
      },
    });
  setup.service.profilesRepository = {
    findOneBy: async () => ({ applicationEmailUpdates: false }),
  };

  const result = await setup.service.updateStatus(
    { id: 9 },
    22,
    "hired",
    "Employer confirmed the candidate was hired.",
    6,
  );

  assert.equal(result.status, "hired");
  assert.equal(application.status, "hired");
  assert.equal(setup.histories[0].fromStatus, "offer_accepted");
  assert.equal(setup.histories[0].toStatus, "hired");
  assert.ok(setup.notifications.some((item) =>
    item.message.includes("now hired")));
  assert.equal(setup.audits[0].details.status, "hired");
  await assert.rejects(
    setup.service.updateStatus(
      { id: 9 },
      22,
      "hired",
      "Duplicate hire confirmation",
      6,
    ),
    /cannot move from hired to hired/,
  );
  assert.equal(setup.histories.length, 1);
});

test("the employer application status DTO accepts the hired outcome", async () => {
  const dto = Object.assign(new UpdateApplicationStatusDto(), {
    status: "hired",
  });

  assert.deepEqual(await validate(dto), []);
});
