const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { ForbiddenException, ServiceUnavailableException } = require("@nestjs/common");
const {
  CaptchaVerificationService,
} = require("../dist/auth/captcha-verification.service.js");

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY,
  RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,
  RECAPTCHA_ALLOWED_HOSTNAMES: process.env.RECAPTCHA_ALLOWED_HOSTNAMES,
};
const originalFetch = global.fetch;

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  global.fetch = originalFetch;
});

test("CAPTCHA is optional only outside production when no keys are configured", async () => {
  process.env.NODE_ENV = "development";
  delete process.env.RECAPTCHA_SITE_KEY;
  delete process.env.RECAPTCHA_SECRET_KEY;
  await new CaptchaVerificationService().verify(undefined);

  process.env.NODE_ENV = "production";
  await assert.rejects(
    new CaptchaVerificationService().verify(undefined),
    (error) =>
      error instanceof ServiceUnavailableException && error.getStatus() === 503,
  );
});

test("CAPTCHA rejects an invalid or disallowed hostname response", async () => {
  process.env.NODE_ENV = "production";
  process.env.RECAPTCHA_SITE_KEY = "site-key";
  process.env.RECAPTCHA_SECRET_KEY = "secret-key";
  process.env.RECAPTCHA_ALLOWED_HOSTNAMES = "portal.example.test";
  global.fetch = async () =>
    new Response(JSON.stringify({ success: true, hostname: "attacker.test" }), {
      status: 200,
    });

  await assert.rejects(
    new CaptchaVerificationService().verify("captcha-token"),
    (error) => error instanceof ForbiddenException && error.getStatus() === 403,
  );
});

test("CAPTCHA passes a verified token to Google with the configured host accepted", async () => {
  process.env.NODE_ENV = "production";
  process.env.RECAPTCHA_SITE_KEY = "site-key";
  process.env.RECAPTCHA_SECRET_KEY = "secret-key";
  process.env.RECAPTCHA_ALLOWED_HOSTNAMES = "portal.example.test";
  let submittedBody;
  global.fetch = async (_url, options) => {
    submittedBody = options.body;
    return new Response(
      JSON.stringify({ success: true, hostname: "portal.example.test" }),
      { status: 200 },
    );
  };

  await new CaptchaVerificationService().verify("captcha-token", "203.0.113.1");

  assert.equal(submittedBody.get("secret"), "secret-key");
  assert.equal(submittedBody.get("response"), "captcha-token");
  assert.equal(submittedBody.get("remoteip"), "203.0.113.1");
});

test("CAPTCHA verification fails closed when Google is unavailable", async () => {
  process.env.NODE_ENV = "production";
  process.env.RECAPTCHA_SITE_KEY = "site-key";
  process.env.RECAPTCHA_SECRET_KEY = "secret-key";
  global.fetch = async () => {
    throw new Error("network unavailable");
  };

  await assert.rejects(
    new CaptchaVerificationService().verify("captcha-token"),
    (error) =>
      error instanceof ServiceUnavailableException && error.getStatus() === 503,
  );
});
