const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidateApplicationsService,
} = require("../dist/users/candidate-applications.service.js");
const {
  CandidateApplicationDocument,
} = require("../dist/users/candidate-application-document.entity.js");
const { Job } = require("../dist/jobs/job.entity.js");

test("candidate document upload is scoped to the signed-in user and requested job", async () => {
  const saved = [];
  const uploads = [];
  const audits = [];
  const repository = {
    create: (document) => document,
    save: async (document) => {
      saved.push(document);
      return {
        ...document,
        id: 21,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      };
    },
  };
  const service = Object.create(CandidateApplicationsService.prototype);
  service.jobsRepository = {
    findOneBy: async (criteria) => {
      assert.deepEqual(criteria, { id: 7, isActive: true });
      return {
        id: 7,
        requiredDocuments: [
          { id: "portfolio", label: "Portfolio", required: true },
        ],
      };
    },
  };
  service.fileStorage = {
    newObjectPath: (userId, kind, extension) =>
      `${userId}/${kind}/file.${extension}`,
    upload: async (...args) => uploads.push(args),
    remove: async () =>
      assert.fail("successful database write should not clean up"),
  };
  service.dataSource = {
    getRepository: (entity) => {
      assert.equal(entity, CandidateApplicationDocument);
      return repository;
    },
  };
  service.auditService = {
    record: async (event) => audits.push(event),
  };

  const result = await service.uploadDocument({ id: 42 }, 7, "portfolio", {
    buffer: Buffer.from("%PDF-test"),
    originalname: "port\nfolio.pdf",
    contentType: "application/pdf",
  });

  assert.equal(uploads[0][0], "42/application/file.pdf");
  assert.equal(saved[0].userId, 42);
  assert.equal(saved[0].jobId, 7);
  assert.equal(saved[0].documentLabel, "Portfolio");
  assert.equal(saved[0].fileName, "port_folio.pdf");
  assert.equal("filePath" in result, false);
  assert.equal(audits[0].action, "candidate.application_document_uploaded");
});

test("candidate cannot attach a document not requested by the selected job", async () => {
  const service = Object.create(CandidateApplicationsService.prototype);
  let uploaded = false;
  service.jobsRepository = {
    findOneBy: async () => ({
      id: 7,
      requiredDocuments: [
        { id: "portfolio", label: "Portfolio", required: true },
      ],
    }),
  };
  service.fileStorage = {
    newObjectPath: () => "unused",
    upload: async () => {
      uploaded = true;
    },
  };

  await assert.rejects(
    () =>
      service.uploadDocument({ id: 42 }, 7, "other", {
        buffer: Buffer.from("%PDF-test"),
        originalname: "document.pdf",
        contentType: "application/pdf",
      }),
    /not requested/,
  );
  assert.equal(uploaded, false);
});

test("application submission blocks when a required document is missing", async () => {
  let applicationInsertAttempted = false;
  const job = {
    id: 7,
    isActive: true,
    requiredDocuments: [
      { id: "portfolio", label: "Portfolio", required: true },
    ],
    applicationQuestions: [],
  };
  const jobRepository = {
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
      getOne: async () => job,
    }),
  };
  const documentRepository = {
    find: async () => [],
  };
  const service = Object.create(CandidateApplicationsService.prototype);
  service.applicationsRepository = { findOne: async () => null };
  service.jobsRepository = { findOneBy: async () => job };
  service.profilesRepository = { findOneBy: async () => null };
  service.usersRepository = {
    findOneBy: async () => ({ id: 42, isActive: true }),
  };
  service.dataSource = {
    transaction: async (callback) =>
      callback({
        getRepository(entity) {
          if (entity === Job) return jobRepository;
          if (entity === CandidateApplicationDocument)
            return documentRepository;
          throw new Error(`Unexpected repository: ${entity.name}`);
        },
        createQueryBuilder() {
          applicationInsertAttempted = true;
          throw new Error("application insertion must not be reached");
        },
      }),
  };

  await assert.rejects(
    () => service.submit({ id: 42 }, 7, {}),
    /Upload the required document\(s\).*Portfolio/,
  );
  assert.equal(applicationInsertAttempted, false);
});
