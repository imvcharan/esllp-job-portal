const assert = require("node:assert/strict");
const { test } = require("node:test");
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

function createService({ application, offer = null }) {
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
