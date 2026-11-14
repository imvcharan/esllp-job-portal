const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { createHmac, createHash } = require("node:crypto");
const {
  encryptConfigSecret,
  getConfigSecretKey,
} = require("../dist/common/encrypted-config-secret.js");
const {
  SuperadminMfaService,
} = require("../dist/auth/superadmin-mfa.service.js");
const { JwtAuthGuard } = require("../dist/auth/jwt-auth.guard.js");
const { UserRole, EmployerApprovalStatus } = require("../dist/users/user.entity.js");

const originalEncryptionKey = process.env.MFA_CONFIG_ENCRYPTION_KEY;

afterEach(() => {
  if (originalEncryptionKey === undefined)
    delete process.env.MFA_CONFIG_ENCRYPTION_KEY;
  else process.env.MFA_CONFIG_ENCRYPTION_KEY = originalEncryptionKey;
});

test("a valid TOTP step cannot be replayed for superadmin login", async () => {
  process.env.MFA_CONFIG_ENCRYPTION_KEY = "test-only-mfa-encryption-key-32-chars";
  const key = getConfigSecretKey(process.env.MFA_CONFIG_ENCRYPTION_KEY);
  const secret = "JBSWY3DPEHPK3PXP";
  const configuration = {
    userId: 7,
    secretEncrypted: encryptConfigSecret(secret, key),
    pendingSecretEncrypted: null,
    enabled: true,
    lastTotpStep: null,
    updatedAt: new Date(),
  };
  let update;
  const configurations = {
    findOne: async () => configuration,
    createQueryBuilder() {
      const builder = {
        update: () => builder,
        set: (values) => {
          update = values;
          return builder;
        },
        where: () => builder,
        andWhere: () => builder,
        execute: async () => {
          const nextStep = update.lastTotpStep;
          if (
            !configuration.enabled ||
            (configuration.lastTotpStep !== null &&
              configuration.lastTotpStep >= nextStep)
          )
            return { affected: 0 };
          configuration.lastTotpStep = nextStep;
          return { affected: 1 };
        },
      };
      return builder;
    },
  };
  const recoveryCodes = {
    update: async () => ({ affected: 0 }),
  };
  const service = new SuperadminMfaService(
    configurations,
    recoveryCodes,
    {},
  );

  const step = Math.floor(Date.now() / 30_000);
  const code = totp(secret, step);
  assert.equal(await service.verifyLogin(7, code), true);
  assert.equal(await service.verifyLogin(7, code), false);
});

test("a recovery code is consumed once and its stored value is hashed", async () => {
  process.env.MFA_CONFIG_ENCRYPTION_KEY = "test-only-mfa-encryption-key-32-chars";
  const key = getConfigSecretKey(process.env.MFA_CONFIG_ENCRYPTION_KEY);
  const configuration = {
    userId: 7,
    secretEncrypted: encryptConfigSecret("JBSWY3DPEHPK3PXP", key),
    pendingSecretEncrypted: null,
    enabled: true,
    lastTotpStep: null,
    updatedAt: new Date(),
  };
  const recoveryCode = "AAAA-BBBB-CCCC-DDDD";
  const expectedHash = createHash("sha256")
    .update("AAAABBBBCCCCDDDD")
    .digest("hex");
  let used = false;
  const configurations = {
    findOne: async () => configuration,
    createQueryBuilder() {
      throw new Error("TOTP update should not be used for a recovery code.");
    },
  };
  const recoveryCodes = {
    update: async (criteria, values) => {
      assert.equal(criteria.codeHash, expectedHash);
      assert.equal(criteria.usedAt._type, "isNull");
      assert.equal(values.usedAt instanceof Date, true);
      if (used) return { affected: 0 };
      used = true;
      return { affected: 1 };
    },
  };
  const service = new SuperadminMfaService(configurations, recoveryCodes, {});

  assert.equal(await service.verifyLogin(7, recoveryCode), true);
  assert.equal(await service.verifyLogin(7, recoveryCode), false);
});

test("superadmin API authorization rejects access tokens without verified MFA", async () => {
  const user = {
    id: 7,
    email: "admin@example.test",
    displayName: "Admin",
    role: UserRole.SUPERADMIN,
    employerApprovalStatus: EmployerApprovalStatus.NOT_APPLICABLE,
    mustChangePassword: false,
    username: "admin",
    phoneVerified: true,
    isActive: true,
  };
  let tokenPayload = { sub: user.id, mfa: false };
  const guard = new JwtAuthGuard(
    { verifyAsync: async () => tokenPayload },
    { getAllAndOverride: () => false },
    { findOneBy: async () => user },
  );
  const request = { headers: { authorization: "Bearer token" } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };

  await assert.rejects(
    guard.canActivate(context),
    (error) => error.getStatus() === 403,
  );
  tokenPayload = { sub: user.id, mfa: true };
  assert.equal(await guard.canActivate(context), true);
});

function totp(secret, step) {
  const key = decodeBase32(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const output = [];
  for (const character of value) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}
