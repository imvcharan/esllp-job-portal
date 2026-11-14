const assert = require("node:assert/strict");
const { test } = require("node:test");
const { BadRequestException } = require("@nestjs/common");
const {
  AdminUsersService,
} = require("../dist/admin/admin-users.service.js");
const { RefreshSession } = require("../dist/auth/refresh-session.entity.js");
const { User, UserRole } = require("../dist/users/user.entity.js");

function createService() {
  const audits = [];
  const user = {
    id: 8,
    email: "candidate@example.com",
    displayName: "Candidate",
    role: UserRole.CANDIDATE,
    isActive: true,
    companyName: null,
    companyWebsite: null,
    employerApprovalStatus: null,
    emailVerified: true,
    mustChangePassword: false,
    createdAt: new Date(),
  };
  const users = {
    findOneBy: async () => user,
    save: async (value) => value,
  };
  const manager = {
    getRepository(entity) {
      if (entity === User) return users;
      if (entity === RefreshSession)
        return { update: async () => undefined };
      throw new Error("Unexpected repository");
    },
  };
  return {
    audits,
    service: new AdminUsersService(
      { manager: { transaction: (callback) => callback(manager) } },
      { record: async (entry) => audits.push(entry) },
      {},
    ),
  };
}

test("admin account status changes require and audit a trimmed reason", async () => {
  const { service, audits } = createService();

  await service.changeStatus(
    3,
    8,
    false,
    "  suspected account compromise  ",
    "127.0.0.1",
  );

  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "user.deactivated");
  assert.equal(audits[0].details.reason, "suspected account compromise");
  assert.equal(audits[0].ipAddress, "127.0.0.1");
});

test("admin account status change rejects a missing reason before mutation", async () => {
  const { service, audits } = createService();

  await assert.rejects(
    service.changeStatus(3, 8, false, "  "),
    BadRequestException,
  );
  assert.deepEqual(audits, []);
});
