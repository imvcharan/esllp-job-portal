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
  assert.match(html, /name="email" type="email" autocomplete="email"/);
  assert.match(html, /const email = String\(formData\.get\("email"\) \|\| ""\)\.trim\(\)/);
  assert.match(html, /name="intent" value="resend">Resend SMS code/);
  assert.match(html, /action !== "phone-verification-resend" &&\s*!form\.reportValidity\(\)/);
  assert.match(
    html,
    /Enter your account email above before requesting another SMS code/,
  );
});

test("registration opens mobile verification only after email verification", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(html, /Verify your account/);
  assert.match(
    html,
    /Complete these two checks in order: verify your email first, then your mobile number/,
  );
  assert.match(html, /Open the verification link sent to/);
  assert.match(html, /Verify your email first\. We’ll send the mobile verification code/);
  assert.match(
    html,
    /\$\{!emailVerified \|\| phoneVerified \? "" : `<form class="auth-form" id="phone-verification-verify-form"/,
  );
  assert.match(html, /6-digit SMS code<input name="code"/);
  assert.match(html, /autocomplete="one-time-code"/);
  assert.match(html, /result\.emailVerified/);
  assert.match(html, /result\.phoneVerified/);
  assert.match(html, /Wrong number\? Change it/);
  assert.match(html, /#registration-phone-change/);
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

test("employer account CTA stays visible across desktop, tablet, and mobile layouts", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(
    html,
    /class="employer-signup-link" href="#sign-up\?role=employer"/,
  );
  assert.match(html, /\.employer-signup-link\s*\{[^}]*color:\s*#fff/);
  assert.match(html, /@media \(min-width: 701px\) and \(max-width: 900px\)/);
  assert.match(html, /\.employer-entry-actions\s*\{[^}]*max-width:\s*340px/);
});

test("login uses one clear divider and aligned alternate sign-in buttons", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(html, /data-google-signin-option hidden/);
  assert.match(
    html,
    /if \(!config\.googleClientId\) \{\s+if \(googleOption\) googleOption\.hidden = true;/,
  );
  assert.match(html, /class="button button-light auth-email-code" href="#email-otp"/);
  assert.match(html, /Other ways to sign in/);
  assert.doesNotMatch(html, /Or continue with Google|Or use a one-time code/);
  assert.match(html, /\.auth-tabs a\s*\{[^}]*background:\s*#e2eee8/);
  assert.match(html, /\.auth-tabs a\[aria-current="page"\]\s*\{[^}]*background:\s*var\(--green\)/);
  assert.match(html, /theme: "filled_blue"/);
  assert.match(html, /shape: "pill"/);
  assert.match(html, /\.auth-divider\s*\{[^}]*font-size:\s*12px/);
  assert.match(html, /\.auth-google-option #google-sign-in\s*\{[^}]*max-width:\s*320px/);
  assert.match(html, /\.auth-email-code\s*\{[^}]*max-width:\s*320px/);
  assert.doesNotMatch(
    html,
    /Google sign-in is unavailable until configured by the service/,
  );
  assert.match(html, /\.auth-alternatives\s*\{/);
});

test("auth layout top-aligns content and resets scroll without animation", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(
    html,
    /\.auth-layout\s*\{[^}]*align-items:\s*start/,
  );
  assert.match(
    html,
    /renderAuth\(\);\s+window\.scrollTo\(\{\s*top:\s*0,\s*behavior:\s*"instant"\s*\}\);/,
  );
});

test("superadmin MFA code field appears before the verify button", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(
    html,
    /submitButton\.insertAdjacentHTML\(\s*"beforebegin",\s*`<label class="auth-field">Authenticator code or recovery code/,
  );
  assert.match(html, /form\.elements\.mfaCode\.focus\(\)/);
  assert.match(
    html,
    /For routine sign-in, use the current 6-digit code from your authenticator app\. Recovery codes are single-use backups\./,
  );
  assert.match(html, /Complete the CAPTCHA again, then verify\./);
  assert.match(html, /The CAPTCHA has been reset; complete it again before retrying\./);
});

test("announcement banner skips the API request in file previews", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(
    html,
    /async function loadAnnouncementBanner\(\) \{\s+if \(window\.location\.protocol === "file:"\) return;/,
  );
  assert.match(html, /The published announcement could not be loaded\./);
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

test("admin SMS settings use clear field labels, switch cards, and responsive layout", () => {
  const html = readFileSync("public/admin/index.html", "utf8");

  assert.match(html, /#twilio-config-form\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(html, /#twilio-config-form \.form-row:not\(\.form-row-toggle\)\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(html, /#twilio-config-form > \.form-row-toggle\s*\{[^}]*background:\s*#f7faf9/);
  assert.match(html, /input\.toggle\[name="enabled"\],/);
  assert.match(html, /@media \(max-width: 1024px\)\s*\{\s*#twilio-config-form \{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(html, /name="authToken" type="password" maxlength="255" autocomplete="off"/);
  assert.match(html, /"Enter the Twilio Auth Token"/);
});

test("admin API requests renew an expired access token and retry once", () => {
  const html = readFileSync("public/admin/index.html", "utf8");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  const adminScript = scripts.at(-1)?.[1];
  assert.ok(adminScript, "admin application script exists");

  assert.match(adminScript, /let adminRefreshPromise = null/);
  assert.match(adminScript, /async function refreshAdminSession\(\)/);
  assert.match(adminScript, /fetch\("\/api\/auth\/refresh"/);
  assert.match(
    adminScript,
    /response\.status === 401 &&\s+adminAccessToken &&\s+path !== "\/api\/auth\/refresh"/,
  );
  assert.match(adminScript, /response = await sendRequest\(\)/);
  assert.match(adminScript, /Your admin session expired\. Sign in again\. The request was not saved\./);
});

test("admin email template controls use separate labels and full-width fields", () => {
  const html = readFileSync("public/admin/index.html", "utf8");

  assert.match(html, /form\.className = "notification-template-form"/);
  assert.match(html, /label\.htmlFor = field\.id;\s*row\.append\(label, field\)/);
  assert.doesNotMatch(html, /label\.append\(field\)/);
  assert.match(
    html,
    /\.notification-template-form \.form-row textarea \{ max-width: none; min-height: 200px; \}/,
  );
});

test("admin SMS navigation displays one accessible label", () => {
  const html = readFileSync("public/admin/index.html", "utf8");

  assert.match(
    html,
    /href="#twilio-config" data-view="twilio-config" hidden><span class="nav-icon" aria-hidden="true">☎<\/span><span class="nav-text">SMS settings<\/span>/,
  );
  assert.doesNotMatch(
    html,
    /<span class="nav-icon">SMS<\/span><span class="nav-text">SMS settings<\/span>/,
  );
});

test("admin content save and list refresh report distinct outcomes", () => {
  const html = readFileSync("public/admin/index.html", "utf8");
  const start = html.indexOf('#content-entry-form").addEventListener("submit"');
  const end = html.indexOf('#content-table-body").addEventListener("click"', start);
  assert.notEqual(start, -1, "content submit handler exists");
  const handler = html.slice(start, end);

  assert.match(handler, /await authRequest\(id \? `\/api\/admin\/content/);
  assert.match(handler, /resetContentForm\(\);\s*feedback\.textContent = "Content saved\."/);
  assert.match(
    handler,
    /Content saved, but the list could not be refreshed:[\s\S]*Use Refresh to update the list/,
  );
  assert.doesNotMatch(
    handler,
    /Content saved, but the list could not be refreshed:[\s\S]{0,180}Unable to save content/,
  );
});

test("admin dashboard and reports retain inline retry controls after load failures", () => {
  const html = readFileSync("public/admin/index.html", "utf8");
  assert.match(html, /id="overview-load-error" role="alert" hidden/);
  assert.match(html, /Dashboard data could not be loaded:[\s\S]*retry\.dataset\.retryOverview/);
  assert.match(html, /refreshOverviewData\(\)\s*\.catch\(\(\) => \{\}\)/);
  assert.match(html, /Unable to load reports:[\s\S]*retry\.dataset\.retryReports = String\(page\)/);
  assert.match(
    html,
    /loadAdminReports\(Number\(retry\.dataset\.retryReports\)\)\s*\.catch\(\(\) => \{\}\)/,
  );
});

test("admin API failures use endpoint-neutral fallback text", () => {
  const html = readFileSync("public/admin/index.html", "utf8");
  assert.match(html, /message \|\| "The request could not be completed\."/);
  assert.doesNotMatch(html, /message \|\| "Unable to sign in\."/);
});

test("job modal close paths restore focus to the opener", () => {
  const html = readFileSync("public/admin/index.html", "utf8");
  assert.match(html, /let jobModalOpener = null/);
  assert.match(html, /function closeJobModal\(\)[\s\S]*?jobModalOpener\?\.isConnected[\s\S]*?jobModalOpener\.focus\(\)/);
  assert.match(html, /if \(event\.key === "Escape"\) \{\s+closeJobModal\(\)/);
  assert.match(html, /addEventListener\("click", closeJobModal\)/);
  assert.match(html, /if \(event\.target === jobModal\) closeJobModal\(\)/);
});

test("candidate dashboard and reports failures include persistent retry actions", () => {
  const html = readFileSync("public/index.html", "utf8");
  assert.match(html, /stats\.querySelectorAll\("\.workspace-stat-value"\)[\s\S]*?Unavailable/);
  assert.match(html, /retry\.textContent = "Retry dashboard"/);
  assert.match(html, /retry\.addEventListener\("click", \(\) => void loadWorkspaceOverview\(\)\)/);
  assert.match(html, /data-retry-workspace-reports/);
  assert.match(html, /addEventListener\("click", \(\) => void loadWorkspaceReports\(\)\)/);
});

test("successful reports require an explicit new-report action before another submission", () => {
  const html = readFileSync("public/index.html", "utf8");
  assert.match(html, /if \(form\.dataset\.reportSubmitted === "true"\) return/);
  assert.match(html, /Report received\. Thank you for helping us keep the community safe\./);
  assert.match(html, /button\.disabled = true;\s+button\.textContent = "Report received"/);
  assert.match(html, /newReport\.dataset\.reportNew = ""/);
  assert.match(html, /form\.dataset\.reportSubmitted = "false"/);
  assert.match(html, /newReport\.textContent = "Start a new report"/);
});

test("failed job searches can retry the same query and filters", () => {
  const html = readFileSync("public/index.html", "utf8");
  assert.match(html, /id="empty-retry">Retry this search/);
  assert.match(
    html,
    /const terms = parseSearchHash\(state\.searchHash\);\s+void searchJobs\(terms\.query, terms\.location, state\.page\)/,
  );
  assert.match(html, /aria-live="polite">\s*Illustrative preview listings/);
});
