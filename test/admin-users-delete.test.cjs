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
} = {}) {
  const audits = [];
  const removedIds = [];
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
  const service = new AdminUsersService(usersRepository, {
    record: async (entry) => audits.push(entry),
  });
  return { service, audits, removedIds };
}

test("permanently deletes an unlinked account and retains an audit event", async () => {
  const { service, audits, removedIds } = createService();

  const result = await service.remove(8, 3, "127.0.0.1");

  assert.deepEqual(result, { success: true });
  assert.deepEqual(removedIds, [8]);
  assert.equal(audits[0].action, "user.permanently_deleted");
  assert.equal(audits[0].targetId, 8);
  assert.equal(audits[0].details.email, "new-admin@example.com");
});

test("blocks permanent deletion when business records are linked", async () => {
  const { service, removedIds, audits } = createService({
    linkedEntity: CandidateApplication,
  });

  await assert.rejects(service.remove(8, 3), ConflictException);
  assert.deepEqual(removedIds, []);
  assert.deepEqual(audits, []);
});

test("prevents deleting the signed-in account", async () => {
  const { service, removedIds } = createService();

  await assert.rejects(service.remove(8, 8), BadRequestException);
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
  await assert.rejects(service.remove(8, 3), BadRequestException);
  assert.deepEqual(removedIds, []);
});

test("reports a missing account without creating an audit event", async () => {
  const { service, audits, removedIds } = createService({ missingUser: true });

  await assert.rejects(service.remove(404, 3), NotFoundException);
  assert.deepEqual(removedIds, []);
  assert.deepEqual(audits, []);
});
