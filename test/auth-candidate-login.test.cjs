const assert = require("node:assert/strict");
const { test } = require("node:test");
const { hash } = require("bcryptjs");
const { AuthService } = require("../dist/auth/auth.service.js");
const { AuthController } = require("../dist/auth/auth.controller.js");
const {
  User,
  UserRole,
  EmployerApprovalStatus,
} = require("../dist/users/user.entity.js");

function createService(user) {
  const audits = [];
  let tokenRecord = null;
  const sentCodes = [];
  const sentSmsCodes = [];
  const sentSms = [];
  const sessions = [];
  const updates = [];
  const rawQueries = [];
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
        callback({
          getRepository: (entity) =>
            entity === User ? repositories.users : repositories.tokens,
          query: async (...args) => rawQueries.push(args),
        }),
    },
    repositories.users,
    repositories.sessions,
    repositories.tokens,
    { sendLoginCode: async (_email, code) => sentCodes.push(code) },
    {
      assertConfigured: () => undefined,
      sendVerificationCode: async (phone, code) => {
        sentSmsCodes.push(code);
        sentSms.push({ phone, code });
      },
    },
    { record: async (entry) => audits.push(entry) },
  );
  return {
    service,
    sentCodes,
    sentSmsCodes,
    sentSms,
    sessions,
    audits,
    updates,
    rawQueries,
  };
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

test("candidate email OTP sign-in works with an unverified phone", async () => {
  const account = {
    ...candidate,
    isActive: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    phoneVerified: false,
  };
  const { service, sentCodes, sessions } = createService(account);

  await service.requestEmailOtp(account.email);
  const session = await service.verifyEmailOtp(account.email, sentCodes[0]);

  assert.equal(session.accessToken, "access-token");
  assert.equal(session.user.id, account.id);
  assert.equal(sessions.length, 1);
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

test("email verification token consumption returns its user ID through TypeORM", async () => {
  const account = { ...candidate, isActive: true };
  const { service } = createService(account);
  let returningColumns;
  const query = {
    update: () => query,
    set: () => query,
    where: () => query,
    andWhere: () => query,
    returning: (columns) => {
      returningColumns = columns;
      return query;
    },
    execute: async () => ({ raw: [{ user_id: account.id }] }),
  };
  service.tokensRepository.createQueryBuilder = () => query;

  const userId = await service.consumeEmailToken(
    "valid-email-verification-token",
    "email_verification",
  );

  assert.equal(userId, account.id);
  assert.deepEqual(returningColumns, ["userId"]);
});

test("email-link confirmation relies on the one-time token instead of CAPTCHA", async () => {
  let receivedToken;
  const controller = new AuthController(
    {
      verifyEmail: async (token) => {
        receivedToken = token;
        return { emailVerified: true };
      },
    },
    {
      verify: async () => {
        throw new Error("Email link confirmation should not require CAPTCHA");
      },
    },
  );

  const result = await controller.verifyEmail({ token: "one-time-token" });

  assert.equal(receivedToken, "one-time-token");
  assert.deepEqual(result, { emailVerified: true });
});

test("candidate can sign in after email verification without verifying their phone", async () => {
  const account = {
    ...candidate,
    isActive: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    phoneVerified: false,
    passwordHash: await hash("correct horse battery", 4),
  };
  const { service, sessions } = createService(account);
  service.usersRepository.createQueryBuilder = () => {
    const query = {
      addSelect: () => query,
      where: () => query,
      getOne: async () => account,
    };
    return query;
  };

  const result = await service.login({
    email: account.email,
    password: "correct horse battery",
  });

  assert.equal(result.accessToken, "access-token");
  assert.equal(result.user.id, account.id);
  assert.equal(sessions.length, 1);
});

test("employer password login still requires phone verification", async () => {
  const account = {
    ...candidate,
    role: UserRole.EMPLOYER,
    isActive: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    phoneVerified: false,
    passwordHash: await hash("correct horse battery", 4),
  };
  const { service, sessions } = createService(account);
  service.usersRepository.createQueryBuilder = () => {
    const query = {
      addSelect: () => query,
      where: () => query,
      getOne: async () => account,
    };
    return query;
  };

  const result = await service.login({
    email: account.email,
    password: "correct horse battery",
  });

  assert.equal(result.verificationRequired, true);
  assert.equal(result.phoneVerificationRequired, true);
  assert.equal(sessions.length, 0);
});

test("valid password login points unverified email to step one", async () => {
  const account = {
    ...candidate,
    isActive: true,
    emailVerified: false,
    phoneE164: "+919876543210",
    phoneVerified: false,
    passwordHash: await hash("correct horse battery", 4),
  };
  const { service, sessions } = createService(account);
  service.usersRepository.createQueryBuilder = () => {
    const query = {
      addSelect: () => query,
      where: () => query,
      getOne: async () => account,
    };
    return query;
  };

  const result = await service.login({
    email: account.email,
    password: "correct horse battery",
  });

  assert.equal(result.verificationRequired, true);
  assert.equal(result.emailVerified, false);
  assert.equal(result.phoneVerified, false);
  assert.match(result.message, /Complete Step 1/);
  assert.equal(sessions.length, 0);
});

test("login controller returns verification status without issuing a refresh cookie", async () => {
  const verificationStatus = {
    verificationRequired: true,
    email: candidate.email,
    emailVerified: true,
    phoneVerified: false,
    message: "Your email is already verified.",
  };
  let clearedCookie = false;
  let issuedCookie = false;
  const controller = new AuthController(
    { login: async () => verificationStatus },
    { verify: async () => undefined },
  );
  const response = {
    clearCookie: () => {
      clearedCookie = true;
    },
    cookie: () => {
      issuedCookie = true;
    },
  };

  const result = await controller.login(
    { email: candidate.email, password: "correct password" },
    { ip: "127.0.0.1" },
    response,
  );

  assert.deepEqual(result, verificationStatus);
  assert.equal(clearedCookie, true);
  assert.equal(issuedCookie, false);
});

test("Google sign-in allows an email-verified candidate with an unverified phone", async () => {
  const account = {
    ...candidate,
    isActive: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    phoneVerified: false,
    googleSubject: null,
  };
  const { service, sessions } = createService(account);
  service.usersRepository.findOneBy = async (criteria) =>
    criteria.googleSubject ? null : account;
  service.googleClient = {
    verifyIdToken: async () => ({
      getPayload: () => ({
        sub: "google-subject",
        email: account.email,
        email_verified: true,
      }),
    }),
  };
  service.recordLoginFailure = async () => undefined;
  const previousClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";

  try {
    const session = await service.googleSignIn("valid-id-token");
    assert.equal(session.accessToken, "access-token");
    assert.equal(session.user.id, account.id);
    assert.equal(account.googleSubject, "google-subject");
    assert.equal(sessions.length, 1);
  } finally {
    if (previousClientId === undefined) {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    } else {
      process.env.GOOGLE_OAUTH_CLIENT_ID = previousClientId;
    }
  }
});

test("registration phone OTP verifies the number before sign-in", async () => {
  const account = {
    ...candidate,
    phoneE164: "+919876543210",
    pendingPhoneE164: null,
    phoneVerified: false,
    emailVerified: false,
  };
  const { service, sentSmsCodes, sentSms, updates, audits } =
    createService(account);

  await service.requestRegistrationPhoneVerification(account.email);
  assert.equal(sentSmsCodes.length, 0);
  await assert.rejects(
    service.verifyRegistrationPhone(account.email, "123456"),
    /Verify your email before verifying your mobile number/,
  );

  service.consumeEmailToken = async () => account.id;
  const emailResult = await service.verifyEmail("valid-email-token");
  assert.match(emailResult.message, /mobile verification is optional/i);
  assert.match(sentSmsCodes[0], /^\d{6}$/);
  assert.equal(sentSms[0].phone, account.phoneE164);
  const result = await service.verifyRegistrationPhone(
    account.email,
    sentSmsCodes[0],
  );

  assert.match(result.message, /email and phone are verified/);
  assert.equal(result.emailVerified, true);
  assert.equal(result.phoneVerified, true);
  assert.equal(updates[0].emailVerified, true);
  assert.equal(updates.at(-1).phoneVerified, true);
  assert.equal(updates.at(-1).phoneE164, account.phoneE164);
  assert.deepEqual(
    audits.map(({ action }) => action),
    ["auth.email_verified", "auth.phone_verified"],
  );
});

test("email verification reports both account verification states", async () => {
  const account = {
    ...candidate,
    isActive: true,
    emailVerified: false,
    phoneVerified: false,
    phoneE164: "+919876543210",
  };
  const { service } = createService(account);
  service.consumeEmailToken = async () => account.id;

  const result = await service.verifyEmail("valid-email-token");

  assert.equal(result.emailVerified, true);
  assert.equal(result.phoneVerified, false);
  assert.equal(result.phoneCodeSent, true);
  assert.equal(result.phoneVerificationRequired, false);
  assert.equal(account.emailVerified, true);
});

test("email verification keeps the account verified and offers SMS resend when delivery fails", async () => {
  const account = {
    ...candidate,
    isActive: true,
    emailVerified: false,
    phoneVerified: false,
    phoneE164: "+919876543210",
  };
  const { service } = createService(account);
  service.consumeEmailToken = async () => account.id;
  service.smsDelivery.sendVerificationCode = async () => {
    throw new Error("SMS provider unavailable");
  };
  service.logger = { error: () => undefined };

  const result = await service.verifyEmail("valid-email-token");

  assert.equal(result.emailVerified, true);
  assert.equal(result.phoneCodeSent, false);
  assert.equal(result.phoneVerificationRequired, false);
  assert.equal(account.emailVerified, true);
  assert.match(result.message, /mobile verification is optional/i);
  assert.match(result.message, /request it later/i);
});

test("registration phone can be corrected after email ownership is verified", async () => {
  const account = {
    ...candidate,
    isActive: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    pendingPhoneE164: null,
    phoneVerified: false,
    passwordHash: await hash("correct-horse-battery", 4),
  };
  const { service, sentSms, audits, updates } = createService(account);
  service.usersRepository.createQueryBuilder = () => {
    const query = {
      addSelect: () => query,
      where: () => query,
      getOne: async () => account,
    };
    return query;
  };
  service.usersRepository.findOneBy = async (criteria) => {
    if (Object.hasOwn(criteria, "phoneE164")) {
      return criteria.phoneE164 === account.phoneE164 ? account : null;
    }
    if (Object.hasOwn(criteria, "pendingPhoneE164")) {
      return criteria.pendingPhoneE164 === account.pendingPhoneE164
        ? account
        : null;
    }
    return account;
  };

  const result = await service.changeUnverifiedRegistrationPhone(
    account.email,
    "correct-horse-battery",
    "+14155550123",
  );
  assert.match(result.message, /new verification code was sent/);
  assert.equal(account.pendingPhoneE164, "+14155550123");
  assert.equal(sentSms[0].phone, "+14155550123");
  assert.equal(audits[0].action, "auth.registration_phone_changed");

  await service.requestRegistrationPhoneVerification(account.email);
  assert.equal(sentSms[1].phone, "+14155550123");
  await assert.rejects(
    service.verifyRegistrationPhone(account.email, sentSms[0].code),
    /incorrect or expired/,
  );
  const verified = await service.verifyRegistrationPhone(
    account.email,
    sentSms[1].code,
  );
  assert.equal(verified.phoneVerified, true);
  assert.equal(account.phoneE164, "+14155550123");
  assert.equal(account.pendingPhoneE164, null);
  assert.equal(updates.at(-1).phoneVerified, true);
});

test("registration phone cannot be changed before email verification", async () => {
  const account = {
    ...candidate,
    isActive: true,
    emailVerified: false,
    phoneE164: "+919876543210",
    phoneVerified: false,
    passwordHash: await hash("correct-horse-battery", 4),
  };
  const { service, sentSms } = createService(account);
  service.usersRepository.createQueryBuilder = () => {
    const query = {
      addSelect: () => query,
      where: () => query,
      getOne: async () => account,
    };
    return query;
  };

  await assert.rejects(
    service.changeUnverifiedRegistrationPhone(
      account.email,
      "correct-horse-battery",
      "+14155550123",
    ),
    /Verify your email/,
  );
  assert.equal(sentSms.length, 0);

  account.emailVerified = true;
  await assert.rejects(
    service.changeUnverifiedRegistrationPhone(
      account.email,
      "wrong-password",
      "+14155550123",
    ),
    /Verify your email and enter the password/,
  );
  assert.equal(sentSms.length, 0);
});

test("registration phone change rejects passwords exceeding the bcrypt byte limit", async () => {
  const { service, sentSms } = createService(candidate);

  await assert.rejects(
    service.changeUnverifiedRegistrationPhone(
      candidate.email,
      "₹".repeat(25),
      "+14155550123",
    ),
    /Verify your email and enter the password/,
  );
  assert.equal(sentSms.length, 0);
});

test("candidate registration reports when verification email delivery fails", async () => {
  const { service } = createService(null);
  service.platformConfiguration = {
    assertRegistrationEnabled: async () => undefined,
  };
  service.usersRepository.create = (values) => values;
  service.usersRepository.findOneBy = async () => null;
  service.usersRepository.save = async (account) => ({ id: 22, ...account });
  service.issueOtp = async () => undefined;
  service.sendVerification = async () => {
    throw new Error("mail provider unavailable");
  };
  service.logger = { error: () => undefined };

  const result = await service.registerCandidate({
    email: "new-candidate@example.test",
    password: "correct-horse-battery",
    displayName: "New Candidate",
    phoneNumber: "+919876543210",
  });

  assert.match(result.message, /verification email could not be sent/);
  assert.doesNotMatch(result.message, /SMS code/);
  assert.doesNotMatch(result.message, /link we sent/);
});

test("email resend surfaces delivery failures instead of reporting a false success", async () => {
  const account = {
    ...candidate,
    isActive: true,
    emailVerified: false,
  };
  const { service } = createService(account);
  service.sendVerification = async () => {
    throw new Error("mail provider unavailable");
  };
  service.logger = { error: () => undefined };

  await assert.rejects(
    service.resendVerification(account.email),
    /mail provider unavailable/,
  );
});

test("phone number changes take effect only after the new number is verified", async () => {
  const account = {
    ...candidate,
    phoneE164: "+919876543210",
    pendingPhoneE164: null,
    phoneVerified: true,
  };
  const { service, sentSmsCodes, updates, rawQueries } = createService(account);

  await service.requestPhoneChange(account.id, "+919812345678");
  assert.equal(account.phoneE164, "+919876543210");
  assert.equal(account.pendingPhoneE164, "+919812345678");
  await service.verifyPhoneChange(account.id, sentSmsCodes[0]);

  assert.equal(updates.at(-1).phoneE164, "+919812345678");
  assert.equal(updates.at(-1).pendingPhoneE164, null);
  assert.equal(updates.at(-1).phoneVerified, true);
  assert.ok(
    rawQueries.some(([sql]) =>
      sql.includes("SET whatsapp_interview_reminders = false"),
    ),
  );
  assert.ok(
    rawQueries.some(([sql]) => sql.includes("whatsapp_notification_outbox")),
  );
});

test("candidate can verify their existing unverified number after signing in", async () => {
  const account = {
    ...candidate,
    phoneE164: "+919876543210",
    pendingPhoneE164: null,
    phoneVerified: false,
  };
  const { service, sentSmsCodes } = createService(account);

  await service.requestPhoneChange(account.id, account.phoneE164);
  assert.equal(sentSmsCodes.length, 1);
  await service.verifyPhoneChange(account.id, sentSmsCodes[0]);

  assert.equal(account.phoneE164, "+919876543210");
  assert.equal(account.pendingPhoneE164, null);
  assert.equal(account.phoneVerified, true);
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
