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
