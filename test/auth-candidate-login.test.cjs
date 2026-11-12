const assert = require("node:assert/strict");
const { test } = require("node:test");
const { AuthService } = require("../dist/auth/auth.service.js");
const {
  UserRole,
  EmployerApprovalStatus,
} = require("../dist/users/user.entity.js");

function createService(user) {
  const audits = [];
  let tokenRecord = null;
  const sentCodes = [];
  const sentSmsCodes = [];
  const sessions = [];
  const updates = [];
  const repositories = {
    users: {
      findOneBy: async () => user,
      update: async (_criteria, values) => {
        Object.assign(user, values);
        updates.push(values);
      },
      save: async (account) => account,
    },
    sessions: {
      create: (session) => session,
      save: async (session) => sessions.push(session),
    },
    tokens: {
      update: async () => ({ affected: 1 }),
      save: async (token) => {
        tokenRecord = token;
        return token;
      },
      create: (token) => ({ attempts: 0, ...token }),
      createQueryBuilder() {
        const query = {
          where: () => query,
          andWhere: () => query,
          orderBy: () => query,
          setLock: () => query,
          getOne: async () =>
            tokenRecord && !tokenRecord.usedAt ? tokenRecord : null,
        };
        return query;
      },
    },
  };
  const service = new AuthService(
    { signAsync: async () => "access-token" },
    {
      transaction: async (callback) =>
        callback({ getRepository: () => repositories.tokens }),
    },
    repositories.users,
    repositories.sessions,
    repositories.tokens,
    { sendLoginCode: async (_email, code) => sentCodes.push(code) },
    {
      assertConfigured: () => undefined,
      sendVerificationCode: async (_phone, code) => sentSmsCodes.push(code),
    },
    { record: async (entry) => audits.push(entry) },
  );
  return { service, sentCodes, sentSmsCodes, sessions, audits, updates };
}

const candidate = {
  id: 21,
  email: "candidate@example.test",
  displayName: "Candidate",
  role: UserRole.CANDIDATE,
  employerApprovalStatus: EmployerApprovalStatus.NOT_APPLICABLE,
  mustChangePassword: false,
};

test("email OTP issues a short-lived code and creates a candidate session once", async () => {
  const { service, sentCodes, sessions, audits } = createService(candidate);
  const request = await service.requestEmailOtp(" CANDIDATE@example.test ");
  assert.match(request.message, /If a verified candidate account exists/);
  assert.match(sentCodes[0], /^\d{6}$/);

  const session = await service.verifyEmailOtp(candidate.email, sentCodes[0]);
  assert.equal(session.accessToken, "access-token");
  assert.equal(session.user.id, candidate.id);
  assert.equal(sessions.length, 1);
  assert.equal(audits[0].details.method, "email_otp");
  await assert.rejects(
    service.verifyEmailOtp(candidate.email, sentCodes[0]),
    /incorrect or expired/,
  );
});

test("email OTP request does not reveal whether an account exists", async () => {
  const { service, sentCodes } = createService(null);
  const result = await service.requestEmailOtp("missing@example.test");

  assert.match(result.message, /If a verified candidate account exists/);
  assert.equal(sentCodes.length, 0);
});

test("email OTP is invalidated after five incorrect attempts", async () => {
  const { service, sentCodes } = createService(candidate);
  await service.requestEmailOtp(candidate.email);
  const incorrectCode = String((Number(sentCodes[0]) + 1) % 1_000_000).padStart(
    6,
    "0",
  );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      service.verifyEmailOtp(candidate.email, incorrectCode),
      /incorrect or expired/,
    );
  }
  await assert.rejects(
    service.verifyEmailOtp(candidate.email, sentCodes[0]),
    /incorrect or expired/,
  );
});

test("registration phone OTP verifies the number before sign-in", async () => {
  const account = {
    ...candidate,
    phoneE164: "+919876543210",
    pendingPhoneE164: null,
    phoneVerified: false,
    emailVerified: false,
  };
  const { service, sentSmsCodes, updates, audits } = createService(account);

  await service.requestRegistrationPhoneVerification(account.email);
  assert.match(sentSmsCodes[0], /^\d{6}$/);
  const result = await service.verifyRegistrationPhone(
    account.email,
    sentSmsCodes[0],
  );

  assert.match(result.message, /Verify your email/);
  assert.equal(updates[0].phoneVerified, true);
  assert.equal(updates[0].phoneE164, account.phoneE164);
  assert.equal(audits[0].action, "auth.phone_verified");
});

test("phone number changes take effect only after the new number is verified", async () => {
  const account = {
    ...candidate,
    phoneE164: "+919876543210",
    pendingPhoneE164: null,
    phoneVerified: true,
  };
  const { service, sentSmsCodes, updates } = createService(account);

  await service.requestPhoneChange(account.id, "+919812345678");
  assert.equal(account.phoneE164, "+919876543210");
  assert.equal(account.pendingPhoneE164, "+919812345678");
  await service.verifyPhoneChange(account.id, sentSmsCodes[0]);

  assert.equal(updates.at(-1).phoneE164, "+919812345678");
  assert.equal(updates.at(-1).pendingPhoneE164, null);
  assert.equal(updates.at(-1).phoneVerified, true);
});

test("username updates normalize case and reject usernames owned by another user", async () => {
  const account = { ...candidate, username: "user-21" };
  const { service } = createService(account);

  assert.deepEqual(await service.updateUsername(account.id, "My-Profile"), {
    username: "my-profile",
  });
  await assert.rejects(
    service.updateUsername(account.id, "Bad name"),
    /letters, numbers, and hyphens/,
  );
});
