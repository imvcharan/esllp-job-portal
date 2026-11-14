const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const ts = require("typescript");

test("employer candidate discovery loader is available to page-level routes", () => {
  const html = readFileSync("public/index.html", "utf8");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  const applicationScript = scripts.at(-1)?.[1];
  assert.ok(applicationScript, "main application script exists");

  const source = ts.createSourceFile(
    "public/index.html.script.js",
    applicationScript,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  let loader;
  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "loadEmployerCandidates"
    ) {
      loader = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  assert.ok(loader, "employer candidate loader exists");
  assert.equal(
    ts.isSourceFile(loader.parent),
    true,
    "employer candidate loader is page-scoped, not nested in another loader",
  );
});

test("email verification uses route parameters in its submit handler", () => {
  const html = readFileSync("public/index.html", "utf8");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  const applicationScript = scripts.at(-1)?.[1];
  assert.ok(applicationScript, "main application script exists");

  const handlerStart = applicationScript.indexOf(
    'authCard.addEventListener("submit"',
  );
  assert.notEqual(handlerStart, -1, "auth submit handler exists");
  const submitHandler = applicationScript.slice(handlerStart);

  assert.match(
    submitHandler,
    /const actionParams = new URLSearchParams\(\s*currentRouteHash\.split\("\?"\)\[1\] \|\| "",?\s*\)/,
  );
  assert.match(
    submitHandler,
    /action === "verify-email" && actionParams\.get\("email"\)/,
  );
  assert.doesNotMatch(submitHandler, /authParams\.get\("email"\)/);
});

test("verification resend actions reuse the account email and offer recovery", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(html, /#email-otp\?email=\$\{encodeURIComponent\(email\)\}/);
  assert.match(html, /#phone-verification-verify-form \[name="email"\]/);
  assert.match(
    html,
    /Enter your account email above before requesting another SMS code/,
  );
});

test("application review reflects the candidate contact-sharing preference", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(
    html,
    /data-allow-contact="\$\{profile\?\.allowRecruiterContact/,
  );
  assert.match(
    html,
    /const shareContact =\s*form\.dataset\.allowContact === "true" && shareProfile/,
  );
  assert.match(
    html,
    /your contact setting does not allow employer contact details/,
  );
});

test("skill filtering is included in public searches and saved-search links", () => {
  const html = readFileSync("public/index.html", "utf8");
  assert.match(html, /id="filter-skill"/);
  assert.match(html, /\["skill", "#filter-skill", ""\]/);
  assert.match(html, /skill: readFilter\("#filter-skill", ""\)/);
  assert.match(html, /skill: filters\.skill/);
  assert.match(html, /replaceRoute\(state\.searchHash\)/);
});

test("public SPA routes use clean paths and restore navigation with browser history", () => {
  const html = readFileSync("public/index.html", "utf8");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  const applicationScript = scripts.at(-1)?.[1];
  assert.ok(applicationScript, "main application script exists");
  const source = ts.createSourceFile(
    "public/index.html.script.js",
    applicationScript,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );

  assert.equal(source.parseDiagnostics.length, 0, "application script parses");
  assert.match(html, /home: "\/"/);
  assert.match(html, /"how-it-works-page": "\/how-it-works"/);
  assert.match(html, /"employer-solutions": "\/for-employers"/);
  assert.match(html, /window\.addEventListener\("popstate"/);
  assert.doesNotMatch(html, /window\.addEventListener\("hashchange"/);
});

test("the public contact route is linked and provides a support destination", () => {
  const html = readFileSync("public/index.html", "utf8");
  assert.match(html, /href="#contact">Contact<\/a>/);
  assert.match(html, /contact: \{\s+title: "Contact esllp"/);
  assert.match(html, /Email hello@esllp\.in/);
  assert.match(html, /"contact",/);
});

test("quick apply requires saved per-job consent and keeps standard review available", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(html, /Save these choices for quick apply/);
  assert.match(html, /Quick apply using saved choices/);
  assert.match(html, /\/quick-apply-preference/);
  assert.match(html, /\/quick-apply`/);
  assert.match(
    html,
    /Your sharing choices changed\. Save them before using quick apply/,
  );
  assert.match(html, /data-review-application/);
});

test("WhatsApp interview reminders require a verified phone and candidate opt-in", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(html, /name="whatsappInterviewReminders"/);
  assert.match(
    html,
    /Send interview reminders to my verified phone on WhatsApp/,
  );
  assert.match(html, /profile\.phoneVerified \? "" : " disabled"/);
  assert.match(
    html,
    /whatsappInterviewReminders:\s*data\.get\("whatsappInterviewReminders"\) === "on"/,
  );
});

test("admin messaging settings expose independent SMS and WhatsApp controls", () => {
  const html = readFileSync("public/admin/index.html", "utf8");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length, "admin script exists");
  for (const [, script] of scripts) {
    const source = ts.createSourceFile(
      "public/admin/index.html.script.js",
      script,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    assert.equal(source.parseDiagnostics.length, 0, "admin script parses");
  }
  assert.match(html, /name="whatsappEnabled"/);
  assert.match(html, /name="whatsappFrom"/);
  assert.match(html, /name="whatsappTemplateSid"/);
  assert.match(html, /configuration\.whatsappReady/);
});
