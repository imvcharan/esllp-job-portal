const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidateApplicationsService,
} = require("../dist/users/candidate-applications.service.js");
const {
  CandidateApplication,
} = require("../dist/users/candidate-application.entity.js");
const {
  CandidateApplicationDocument,
} = require("../dist/users/candidate-application-document.entity.js");
const {
  CandidateApplicationStatus,
} = require("../dist/users/candidate-application-status.entity.js");
const { Job } = require("../dist/jobs/job.entity.js");

function createSubmissionService({ auditRecord }) {
  const application = {
    id: 21,
    userId: 42,
    jobId: 7,
    status: "submitted",
    job: { id: 7, title: "Engineer", company: "Example" },
  };
  const transactionManager = {
    getRepository(entity) {
      if (entity === Job) {
        return {
          createQueryBuilder: () => ({
            where() {
              return this;
            },
            andWhere() {
              return this;
            },
            setLock() {
              return this;
            },
            getOne: async () => ({
              id: 7,
              isActive: true,
              applicationQuestions: [],
              requiredDocuments: [],
            }),
          }),
        };
      }
      if (entity === CandidateApplicationDocument) {
        return { find: async () => [] };
      }
      if (entity === CandidateApplication) {
        return { findOne: async () => application };
      }
      throw new Error(`Unexpected repository: ${entity.name}`);
    },
    createQueryBuilder() {
      let entity;
      return {
        insert() {
          return this;
        },
        into(value) {
          entity = value;
          return this;
        },
        values() {
          return this;
        },
        orIgnore() {
          return this;
        },
        returning() {
          return this;
        },
        execute: async () => ({
          identifiers: entity === CandidateApplication ? [{ id: 21 }] : [],
        }),
      };
    },
  };
  const service = Object.create(CandidateApplicationsService.prototype);
  let applicationReadCount = 0;
  service.applicationsRepository = {
    findOne: async () => {
      applicationReadCount += 1;
      return applicationReadCount === 1 ? null : application;
    },
  };
  service.jobsRepository = {
    findOneBy: async () => ({
      id: 7,
      isActive: true,
      applicationQuestions: [],
      requiredDocuments: [],
    }),
  };
  service.profilesRepository = { findOneBy: async () => null };
  service.usersRepository = {
    findOneBy: async () => ({ id: 42, isActive: true }),
  };
  service.dataSource = {
    transaction: async (callback) => callback(transactionManager),
  };
  service.auditService = { record: auditRecord };
  service.getHistories = async () => new Map([[application.id, []]]);
  service.getWorkflowRecords = async () => ({
    offers: new Map(),
    messages: new Map(),
  });
  service.toCandidateResponse = (value) => value;
  service.notifyEmployer = async () => {};
  return { service, application, transactionManager };
}

test("application submission records its audit inside the transaction", async () => {
  let auditCall;
  const setup = createSubmissionService({
    auditRecord: async (...args) => {
      auditCall = args;
    },
  });

  const result = await setup.service.submit({ id: 42 }, 7, {});

  assert.equal(result, setup.application);
  assert.equal(auditCall[0].action, "candidate.application_submitted");
  assert.equal(auditCall[0].targetId, setup.application.id);
  assert.equal(auditCall[1], setup.transactionManager);
});

test("application submission does not report success when its audit write fails", async () => {
  let employerNotified = false;
  const setup = createSubmissionService({
    auditRecord: async () => {
      throw new Error("audit storage unavailable");
    },
  });
  setup.service.notifyEmployer = async () => {
    employerNotified = true;
  };

  await assert.rejects(
    () => setup.service.submit({ id: 42 }, 7, {}),
    /audit storage unavailable/,
  );
  assert.equal(employerNotified, false);
});
