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
