const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");

test("auth action requests omit the reCAPTCHA widget's hidden response field", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(
    html,
    /\[\.\.\.formData\.entries\(\)\]\.filter\(\s*\(\[name\]\) => name !== "g-recaptcha-response"/,
  );
});

test("successful email resend shows an inbox confirmation and lets the user retry", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(html, /<h2>Check your inbox<\/h2>/);
  assert.match(html, /fresh link is on its way to <strong>\$\{escapeHtml\(email\)\}<\/strong>/);
  assert.match(html, /Requesting another link invalidates earlier links/);
  assert.match(
    html,
    /href="\$\{resendHref\}">Resend to this email<\/a> · <a href="#resend-verification">Use a different email/,
  );
});

test("email verification offers a resend path when a link is unusable", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(
    html,
    /href="#resend-verification\?email=\$\{encodeURIComponent\(authParams\.get\("email"\) \|\| ""\)\}">Request a new verification link/,
  );
});

test("verification progress makes the email-first order and SMS delivery state explicit", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(html, /Step 1 of 2: Verify your email/);
  assert.match(html, /Step 2 of 2: Verify your mobile/);
  assert.match(html, /phoneCodeSent === "0" \? "SMS not sent"/);
  assert.match(html, /We couldn’t send the SMS code/);
  assert.match(
    html,
    /\.set\(\s*"phoneCodeSent",\s*result\.phoneCodeSent \? "1" : "0"/,
  );
});

test("candidate verification makes phone OTP optional and keeps the sign-in action available", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(html, /authParams\.get\("phoneRequired"\) !== "0"/);
  assert.match(html, /emailVerified && \(phoneVerified \|\| !phoneVerificationRequired\)/);
  assert.match(html, /Verification is optional; you can sign in now/);
  assert.match(html, /phoneRequired=\$\{accountType === "employer" \? "1" : "0"\}/);
  assert.match(html, /payload\.phoneVerificationRequired/);
  assert.match(html, /Leave your current number unchanged to verify it/);
});

test("email-link confirmation does not add another CAPTCHA challenge", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(
    html,
    /\$\{isVerification \? "" : '<div class="auth-captcha" data-recaptcha-container><\/div>'\}/,
  );
  assert.match(html, /const requiresCaptcha = action !== "verify-email"/);
});

test("sign-in resumes at the server-reported verification step", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(html, /if \(payload\.verificationRequired\)/);
  assert.match(
    html,
    /verificationParams\.set\(\s*"emailVerified",\s*"1"\)/,
  );
  assert.match(html, /<h2>Resume verification<\/h2>/);
  assert.match(html, /completed steps won’t be requested again/);
});
