const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  BadRequestException,
  ConflictException,
  NotFoundException,
} = require("@nestjs/common");
const { AdminUsersService } = require("../dist/admin/admin-users.service.js");
const {
  CandidateApplication,
} = require("../dist/users/candidate-application.entity.js");
const {
  CandidateApplicationDocument,
} = require("../dist/users/candidate-application-document.entity.js");
const {
  CandidateApplicationMessage,
} = require("../dist/users/candidate-application-message.entity.js");
const {
  CandidateApplicationStatus,
} = require("../dist/users/candidate-application-status.entity.js");
const {
  CandidateDeletionRequest,
} = require("../dist/users/candidate-deletion-request.entity.js");
const {
  CandidateProfile,
} = require("../dist/users/candidate-profile.entity.js");
const {
  CandidatePremiumOrder,
} = require("../dist/users/candidate-premium-order.entity.js");
const {
  CandidateResumeVersion,
} = require("../dist/users/candidate-resume-version.entity.js");
const {
  CandidateSavedJob,
} = require("../dist/users/candidate-saved-job.entity.js");
const {
  CandidateSavedSearch,
} = require("../dist/users/candidate-saved-search.entity.js");
const {
  EmployerApplicationNote,
} = require("../dist/employers/employer-application-note.entity.js");
const {
  EmployerApplicationTag,
} = require("../dist/employers/employer-application-tag.entity.js");
const {
  EmployerInterview,
} = require("../dist/employers/employer-interview.entity.js");
const {
  EmployerOrganizationMember,
} = require("../dist/employers/organization-member.entity.js");
const {
  UserNotification,
} = require("../dist/employers/user-notification.entity.js");
const { Job } = require("../dist/jobs/job.entity.js");
const { Report } = require("../dist/reports/report.entity.js");
const { User, UserRole } = require("../dist/users/user.entity.js");

function createService({
  linkedEntity,
  user,
  activeSuperadmins = 2,
  missingUser = false,
  applicationDocuments = [],
  resumeVersions = [],
  storageError,
} = {}) {
  const audits = [];
  const removedIds = [];
  const removedFiles = [];
  const targetUser = user || {
    id: 8,
    email: "new-admin@example.com",
    role: UserRole.ADMIN,
    isActive: true,
  };
  const userRepository = {
    findOne: async () => (missingUser ? null : targetUser),
    countBy: async () => activeSuperadmins,
    delete: async (id) => removedIds.push(id),
  };
  const manager = {
    getRepository(entity) {
      if (entity === User) return userRepository;
      if (entity === CandidateApplicationDocument) {
        return { find: async () => applicationDocuments };
      }
      if (entity === CandidateResumeVersion) {
        return { find: async () => resumeVersions };
      }
      return {
        countBy: async () => (entity === linkedEntity ? 1 : 0),
        findOne: async () => null,
      };
    },
  };
  const usersRepository = {
    manager: {
      transaction: async (callback) => callback(manager),
    },
  };
  const service = new AdminUsersService(
    usersRepository,
    {
      record: async (entry) => audits.push(entry),
    },
    {
      removeMany: async (paths) => {
        if (storageError) throw storageError;
        removedFiles.push(...paths);
      },
    },
  );
  return { service, audits, removedIds, removedFiles };
}

test("permanently deletes an unlinked account and retains an audit event", async () => {
  const { service, audits, removedIds } = createService();

  const result = await service.remove(8, 3, "Account cleanup", "127.0.0.1");

  assert.deepEqual(result, { success: true });
  assert.deepEqual(removedIds, [8]);
  assert.equal(audits[0].action, "user.permanently_deleted");
  assert.equal(audits[0].targetId, 8);
  assert.equal(audits[0].details.email, "new-admin@example.com");
  assert.equal(audits[0].details.reason, "Account cleanup");
});

test("blocks permanent deletion when business records are linked", async () => {
  const { service, removedIds, audits } = createService({
    linkedEntity: CandidateApplication,
  });

  test("preserves candidate accounts with premium payment records", async () => {
    const { service, removedIds, audits } = createService({
      linkedEntity: CandidatePremiumOrder,
      user: {
        id: 8,
        email: "candidate@example.com",
        role: UserRole.CANDIDATE,
        isActive: true,
      },
    });

    await assert.rejects(service.remove(8, 3, "Candidate request"), ConflictException);
    assert.deepEqual(removedIds, []);
    assert.deepEqual(audits, []);
  });

  await assert.rejects(service.remove(8, 3, "Candidate request"), ConflictException);
  assert.deepEqual(removedIds, []);
  assert.deepEqual(audits, []);
});

test("prevents deleting the signed-in account", async () => {
  const { service, removedIds } = createService();

  await assert.rejects(service.remove(8, 8, "Own account"), BadRequestException);
  assert.deepEqual(removedIds, []);
});

test("prevents deleting the last active superadmin", async () => {
  const { service, removedIds } = createService({
    user: {
      id: 8,
      email: "admin@example.com",
      role: UserRole.SUPERADMIN,
      isActive: true,
    },
    activeSuperadmins: 1,
  });
  await assert.rejects(service.remove(8, 3, "Remove superadmin"), BadRequestException);
  assert.deepEqual(removedIds, []);
});

test("reports a missing account without creating an audit event", async () => {
  const { service, audits, removedIds } = createService({ missingUser: true });

  await assert.rejects(service.remove(404, 3, "Invalid account"), NotFoundException);
  assert.deepEqual(removedIds, []);
  assert.deepEqual(audits, []);
});

test("purges candidate files from external storage before account deletion", async () => {
  const { service, removedFiles, removedIds } = createService({
    user: {
      id: 8,
      email: "candidate@example.com",
      role: UserRole.CANDIDATE,
      isActive: true,
    },
    applicationDocuments: [
      { filePath: "8/application/portfolio.pdf" },
      { filePath: "8/application/other.docx" },
    ],
    resumeVersions: [{ storagePath: "8/resume/version.pdf" }],
  });

  await service.remove(8, 3, "Candidate requested deletion");

  assert.deepEqual(removedFiles.sort(), [
    "8/application/other.docx",
    "8/application/portfolio.pdf",
    "8/resume/version.pdf",
  ]);
  assert.deepEqual(removedIds, [8]);
});

test("does not delete a candidate account when external file purging fails", async () => {
  const { service, removedIds, audits } = createService({
    user: {
      id: 8,
      email: "candidate@example.com",
      role: UserRole.CANDIDATE,
      isActive: true,
    },
    applicationDocuments: [{ filePath: "8/application/portfolio.pdf" }],
    storageError: new Error("storage unavailable"),
  });

  await assert.rejects(
    service.remove(8, 3, "Candidate requested deletion"),
    /storage unavailable/,
  );
  assert.deepEqual(removedIds, []);
  assert.deepEqual(audits, []);
});
