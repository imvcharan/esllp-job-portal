# esllp Job Portal: Product and Delivery Roadmap

This is the end-to-end delivery roadmap for a working job marketplace across
the web, iOS, and Android. It describes planned work; unchecked items are not
implemented. It is based on the repository's current NestJS, TypeORM, PostgreSQL,
authentication, job-search, and admin foundations.

No roadmap can guarantee that literally nothing will be missed before product
discovery, user research, and operational constraints are confirmed. This
document makes the current assumptions, scope, dependencies, and release gates
explicit so those gaps are found before they become expensive rework.

## 1. Product decisions and scope

### Confirmed direction

- **Market:** India first; design data and interfaces so other markets can be
  added without hard-coding India-specific assumptions throughout the product.
- **Web:** Migrate the public and account-facing experience to Next.js, React,
  and TypeScript. The current static homepage is a starting point, not the
  target frontend architecture.
- **Mobile:** Build one React Native app with Expo for iOS and Android. Both
  candidates and employers need mobile workflows.
- **Backend:** Keep the existing NestJS API and extend it; do not rewrite it or
  split it into microservices without evidence that the current architecture
  cannot meet a measured need.
- **Database:** Use PostgreSQL and TypeORM. Use reviewed schema migrations; never
  enable TypeORM schema synchronization in production.
- **Launch business model:** Free listings and applications in v1. No billing,
  subscriptions, or payment collection in launch scope. Revisit monetization
  after product validation.
- **Admin:** Keep administrative and superadmin work in a protected web
  dashboard. A native admin app is not part of v1.

### Users and principal journeys

1. **Candidate:** discover and search jobs; inspect trustworthy job details;
   register/sign in; maintain a profile and resume; save jobs; apply; track
   applications; receive and manage relevant updates.
2. **Employer/recruiter:** create or join a company; complete company details;
   create and publish jobs; manage listings; review applicants; update
   application stages; communicate and arrange interviews where supported.
3. **Company teammate:** join an organization with a defined role and only the
   permissions granted to that role.
4. **Administrator/moderator:** review employers, jobs and reports; suspend or
   restore accounts/listings under policy; inspect audit history; respond to
   support and privacy requests.

### Explicit v1 boundaries

- Candidate and employer journeys are available on responsive web and mobile.
- Admin/moderation functionality is web-only.
- English is the initial interface language unless product discovery changes
  that decision. Structure text and formatting for later localization; decide
  which Indian languages to support before committing translated content.
- Launch with free job listings/applications; do not imply future paid features
  exist.
- Do not build unrequested social networks, AI ranking, automated hiring
  decisions, payroll, background checks, or payment features into v1.
- Email verification, password recovery, application messaging, push
  notifications, company verification, and report handling are real product
  flows only when their server and operations support is delivered. Never
  present a mock action as completed.

## 2. Technology and system shape

| Area | Direction | Notes |
|---|---|---|
| Public and account web | Next.js + React + TypeScript | Search-engine-friendly public job pages; responsive candidate and employer workspaces. |
| iOS and Android | React Native + Expo + TypeScript | One native client for candidate and employer workflows. |
| API | Existing NestJS + TypeScript | REST API; server owns validation, permissions, and business rules. |
| API contract | OpenAPI and generated TypeScript client/models | Web and mobile consume the same versioned contract; avoid hand-maintained duplicate request types. |
| Database | PostgreSQL + TypeORM | Use migrations, indexes, constraints, transactions, backups, and restore tests. |
| Uploads | Private object storage | Resume files are private; issue authorized, short-lived access, not public URLs. |
| Email and push | Provider-backed adapters behind API modules | Select providers after delivery, cost, India availability, and privacy requirements are evaluated. |
| Admin | Existing protected admin/API foundations, expanded as needed | Continue enforcing server authorization; UI gating is not authorization. |
| Hosting | Separate web, API, database, and object storage deployments | Choose provider after region, budget, data residency, support, and traffic needs are confirmed. |

Keep UI components separate between web and native. Share generated API
contracts, validation rules where portable, and domain documentation—not
browser components inside the native app. Initially retain the existing NestJS
directory layout; introduce a workspace/monorepo layout only as part of a
reviewed foundation task. Keep deployables independently buildable and
releasable.

### Architecture decisions required before implementation

- [ ] Record the supported authentication contract for browser and native
      clients, including refresh, rotation, expiry, logout, revocation, and
      recovery from a lost/expired session.
- [ ] Decide the deployment provider/regions, database hosting, object storage,
      email delivery, push delivery, and observability vendors.
- [ ] Define the job lifecycle, application lifecycle, employer/company
      verification policy, moderation policy, and role/permission matrix.
- [ ] Define which profile fields are visible to employers and at which point
      in an application/recruitment workflow.
- [ ] Define initial language, support channels, retention/deletion rules,
      consent, and the legal/privacy review required for India launch.
- [ ] Agree launch traffic assumptions, service targets, backup recovery
      objectives, and support ownership.

## 3. Current baseline (repository inspection)

- NestJS serves static public and admin HTML and exposes the API under `/api`.
- The served homepage now includes candidate sign-up/sign-in screens that call
  the existing registration, login, refresh, and logout endpoints while
  retaining the homepage's current layout and ocean theme. This is the first
  web implementation slice, not the planned Next.js migration.
- Candidate profile storage now includes name, email, headline, location,
  optional phone, summary, and skills. Authenticated candidate-only profile
  read/update APIs and a matching responsive web editor are implemented and
  verified against the local database.
- Candidate registration, login, access-token authentication, refresh-cookie
  rotation, logout, role guards, and rate limiting exist.
- Public active-job listing/search and admin job management exist.
- Superadmin user administration and audit-log endpoints exist.
- TypeORM migrations and PostgreSQL configuration exist; startup runs migrations.
- Candidate experience/education/preferences completeness, resume storage,
  employer organizations/memberships, applicant review, email
  verification, password recovery, notifications, and moderation workflows
  are not yet complete persistent product capabilities.
- The existing browser roadmap described frontend gaps; this document
  supersedes it as the overall web-and-mobile delivery roadmap.
- The existing static homepage now has responsive candidate and employer
  workspace shells, with candidate profile editing, published-job search,
  job details, account-synced saved jobs, and candidate application
  submission/history inside the candidate shell. Application status is
  currently limited to submitted; resume attachments, withdrawal, employer
  review/status transitions, and notification workflows remain unavailable.
  Employer hiring actions are explicitly unavailable until their APIs and
  workflows are delivered.
- No Next.js client, Expo mobile client, or employer organization/job workflow
  has been delivered yet.
- See [README.md](./README.md) for the existing setup and API details.

Do not remove an existing screen/API until the replacement has parity for its
required behavior, permission checks, tests, and operational ownership.

## Local-first release rule

Build and verify the product against a local development server first. Do not
deploy a public website/API, publish an App Store or Play Store release, or
point real users at the product until the local acceptance gates in this
roadmap pass and the product owner explicitly approves the release.

- Local is the first complete integration environment: API, database, web,
  mobile clients, admin, uploads, and test email/notification behavior must
  work together using non-production accounts and synthetic data.
- Use isolated local configuration and data. Never copy production personal
  data, passwords, tokens, resumes, or secrets into local development.
- Physical phones can reach a development server over the same trusted Wi-Fi
  using the developer machine's LAN address, or through an approved temporary
  development tunnel. A phone's `localhost` means the phone itself, not the
  developer PC. Do not expose a development server or its database publicly
  without access controls.
- Test email with a local inbox/capture service or sandbox provider. Test
  push, Apple/Google signing, and store-specific behavior in their sandbox or
  preview environments when local emulation cannot reproduce them.
- After all local gates pass, make a separate, non-public staging deployment
  for checks that cannot be reproduced locally (production-like HTTPS,
  external provider callbacks, store builds, and device distribution). Only
  proceed from staging to public production after explicit approval.
- A local-only app cannot prove production DNS, TLS, external delivery,
  production-scale performance, store review, or recovery from a cloud
  provider outage. Record these as staging/release gates rather than claiming
  they were tested locally.

## 4. Delivery phases and exit criteria

Complete phases in order where dependencies require it. Each phase has a
demonstrable exit gate; adjust scope only by recording the tradeoff and impact.

### Phase 0 — Product discovery and delivery foundation

**Deliver**

- [ ] Interview representative candidates and employers; document top tasks,
      pain points, job discovery expectations, and employer hiring workflow.
- [ ] Define v1 user stories, acceptance criteria, out-of-scope features, and
      priority order. Document India launch assumptions and English-first
      localization decision.
- [ ] Map user journeys and screen inventory for web, iOS, Android, and admin.
- [ ] Define role/permission matrix, organization membership behavior, job and
      application states, moderation rules, and profile/resume visibility.
- [ ] Write API contracts and error conventions for auth, jobs, profiles,
      companies, saved jobs, applications, uploads, notifications, and admin.
- [ ] Define local-first environments and isolated local configuration,
      synthetic seed data, safe secret handling, database migration policy,
      and the later staging/production promotion and rollback process.
- [ ] Add or confirm CI gates for formatting, lint, type-check, API tests,
      web build, and mobile checks. Keep environment credentials out of Git.
- [ ] Choose cloud, email, file storage, analytics/monitoring, and push
      providers based on documented requirements; do not choose solely by
      convenience.
- [ ] Review privacy, retention, account deletion, incident response, support
      ownership, and applicable India legal requirements with qualified
      stakeholders.

**Exit gate:** Product scope and permission/state diagrams are approved; API
contracts and the local-first environment plan are reviewed; a new developer
can run the existing API, database, and checks locally from documented
instructions without production credentials or data.

### Phase 1 — API hardening and web migration foundation

**Deliver**

- [ ] Audit current API behavior, auth/session handling, migrations, CORS,
      cookies, request validation, throttling, error responses, and admin
      authorization. Fix launch blockers before adding clients.
- [ ] Add OpenAPI generation and a checked/generated TypeScript client, plus
      contract checks that fail when clients and API drift.
- [ ] Define browser session handling and native auth/token-refresh behavior
      before implementing client login. Browser refresh credentials remain
      HttpOnly, Secure in production, and appropriately SameSite; native
      credentials use platform secure storage, not AsyncStorage.
- [ ] Create the Next.js application and deployment/build path. Decide and
      document the incremental route migration and API origin configuration.
- [ ] Create and run the Expo app locally. Defer EAS cloud release builds and
      store submission until the local acceptance gate passes.
- [ ] Make local API URLs configurable per environment. Document how an
      emulator and a physical phone connect to the developer's local API, and
      prevent production builds from accidentally using a localhost endpoint.
- [ ] Add common design tokens, typography, responsive breakpoints, form
      patterns, accessible controls, error/empty/loading states, and analytics
      event conventions.
- [ ] Add request IDs, structured logs, health/readiness checks, and a safe
      error-reporting strategy that excludes credentials, tokens, and resume
      content.

**Exit gate:** Web and mobile shells run against the local API; API contract
is reproducible; auth behavior is documented and tested; local development
uses no production secrets or data. A staging deployment is not a prerequisite
for starting feature work.

### Phase 2 — Public discovery and job-search web

**Deliver**

- [ ] Rebuild public homepage, search results, filters, sorting, pagination,
      and job-detail routes in Next.js using the real jobs API.
- [ ] Preserve useful existing search behavior and direct links; add canonical,
      shareable job URLs, page titles/descriptions, social metadata, and
      appropriate structured data for public listings.
- [ ] Make search, location, filters, sorting, and pagination URL-addressable
      and work with browser back/forward navigation.
- [ ] Clearly handle no results, API failure, stale/unavailable listings, and
      retry. Any sample job is unmistakably preview-only and never actionable.
- [ ] Establish job content rules: required fields, salary/currency/pay period
      provenance, location/work arrangement, publish/expiry timestamps, and
      moderation status.
- [ ] Preserve accessibility and responsive behavior across small phones,
      tablets, and desktop.

**Exit gate:** A visitor can search, filter, open, share, and revisit a published
job URL; only published/eligible jobs appear; API errors are not disguised as
empty or successful results; core journeys pass automated browser tests.

### Phase 3 — Candidate accounts, profile, and resume

**API/data**

- [x] Add initial profile records and a migration for display name, email,
      headline, location, optional phone, summary, and skills.
- [x] Add candidate-only profile read/update APIs with ownership and role
      checks, validation, transactionally saved account name, and private-by-
      default profile behavior.
- [ ] Extend profiles with experience, education, role preferences, work
      preferences, and optional compensation expectations.
- [ ] Add additional profile audit/security events where appropriate and
      define employer visibility when employer workflows are introduced.
- [ ] Implement email verification and password recovery with expiring,
      single-use tokens, rate limits, abuse controls, safe responses, and
      delivery monitoring.
- [ ] Implement private resume upload/replacement/removal and authorized
      download using object storage; validate size and content/type, block
      unsafe paths, record metadata, and define malware scanning/quarantine.
- [ ] Define what happens to candidate data and files when an account is
      disabled, deleted, or subject to a legal retention hold.

**Clients**

- [x] Build web sign-up, sign-in, logout, password visibility, validation,
      refresh-cookie session restoration, and role-based dashboard routing.
- [ ] Add email verification and password recovery screens when the matching
      backend flows are implemented.
- [x] Build a responsive candidate profile editor with server-backed save,
      session refresh/recovery, and honest private-by-default disclosure.
- [ ] Build guided save-and-resume onboarding, profile preview, and honest
      completeness feedback based only on saved data.
- [ ] Add privacy/visibility controls with a clear explanation of when an
      employer can access profile or resume information.
- [ ] Add resume upload progress, file constraints, retry, replacement,
      removal, and actionable error states.

**Exit gate:** A candidate can securely register, recover access, manage a
persisted profile/resume, and control visibility on web; unauthorized accounts
cannot read or modify another candidate's data; files are private and tested.

### Phase 4 — Employer organizations, company pages, and job management

**API/data**

- [ ] Add employer onboarding, organization/company records, memberships,
      invitation acceptance/revocation, and role-based permissions.
- [ ] Enforce tenant isolation: every organization-scoped operation verifies
      both membership and the required permission.
- [ ] Define employer verification and moderation states, evidence, review
      ownership, appeal path, and public badge rules.
- [ ] Expand job data and APIs for responsibilities, qualifications, location,
      work arrangement, employment type, experience, compensation, application
      questions, visibility, moderation, publication, and expiry.
- [ ] Implement explicit draft, pending review (if required), published,
      paused, closed, expired, rejected, and archived transitions. Record who
      changed state and when.
- [ ] Add safe job search/update indexes and pagination; test query behavior
      with realistic data volume.

**Clients**

- [ ] Build company setup/edit, team/member management, job posting, draft
      save, preview, publish, edit, pause, close, and archive flows on web.
- [ ] Build company public pages using employer-supplied data and clearly
      sourced verification status.
- [ ] Keep public job search and job details aligned with server publication
      and moderation state.

**Exit gate:** An authorized employer can manage only their organization's
members and jobs; state transitions and public visibility are tested; a
different tenant cannot access private records; admin can review/act on
verification or moderation cases.

### Phase 5 — Saved jobs, applications, and employer hiring workflow

**API/data**

- [x] Add account-synced saved jobs with unique constraints and idempotent
      candidate-only list/save/remove APIs.
- [x] Add candidate-only application list/read/submit APIs with candidate/job
      uniqueness, published-job eligibility, optional validated note, and
      retry-safe submission.
- [ ] Define application eligibility, required fields/documents, employer
      questions, duplicate behavior, withdrawal rules, and immutable
      submission snapshot requirements.
- [ ] Add application, answer, status-history, and event records. Enforce
      candidate ownership and employer tenant access on every operation.
- [ ] Define status lifecycle (for example submitted, viewed, shortlisted,
      interview, offer, rejected, withdrawn) and permitted transitions.
      Publish the final list and definitions before UI implementation.
- [ ] Add audit trail for employer decisions and access to sensitive
      application/resume data.
- [ ] Add notification preferences and email/push events only after delivery,
      retry, deduplication, unsubscribe, and failure handling are implemented.

**Clients**

- [x] Build account-synced candidate job saving and a saved-jobs workspace
      page with published-job details and removal. Guest and preview saves
      remain browser-local; published guest saves sync on sign-in.
- [x] Build candidate application submission with an optional validated note;
      show success only after an API response and keep retries idempotent.
- [x] Build candidate application history with submitted status and job links;
      employer-driven status updates and withdrawal remain future work.
- [x] Add a review-and-confirm step before submission and disclose that resume
      uploads are not yet supported.
- [ ] Add full status explanations, employer-driven updates, and
      supported withdrawal, and notification preferences.
- [ ] Build employer applicant inbox with job context, filtering/search,
      pagination, authorized candidate/application detail, and resume access.
- [ ] Add stage changes, notes, shortlist/reject actions, history, and
      interview scheduling only with explicit confirmation and delivery state.
- [ ] Provide appropriate privacy notices and avoid exposing candidate data
      beyond what the application workflow requires.

**Exit gate:** Candidate and employer can complete the whole application
lifecycle; permissions, duplicate requests, transitions, audit history,
notifications, and failure/retry cases have automated integration coverage.

### Phase 6 — iOS and Android apps for candidates and employers

**Candidate app**

- [ ] Implement onboarding/authentication, job search/detail, saved jobs,
      profile/resume, applications, tracking, settings, and account deletion.

**Employer app**

- [ ] Implement organization switching (if a user belongs to multiple),
      company/job overview, job create/edit/publish/pause/close, applicant
      inbox, candidate/application review, stage actions, and notification
      preferences according to the same permission rules as web.
- [ ] Defer complex desktop-only bulk administration if necessary, but record
      the exact v1 mobile parity exception and provide a clear web route.

**Both apps**

- [ ] Use secure platform credential storage and the tested native auth
      contract; handle token refresh, expiry, revoked sessions, sign-out, and
      compromised/lost devices.
- [ ] Support deep links for shared job details and relevant application
      destinations; ensure links work when app is absent or user is signed out.
- [ ] Implement upload progress/retry, poor connectivity behavior, safe
      request retries, accessible navigation, screen-reader labels, and
      touch-sized controls.
- [ ] Request notification permission contextually; allow preference changes
      and handle tap-throughs without leaking sensitive text on lock screens.
- [ ] Test development/preview/production builds, app upgrades, signing,
      crash reporting, privacy manifests/disclosures, and store policy
      requirements.

**Exit gate:** Candidate and employer core journeys work on iOS and Android
against the local API; authorization is enforced by API (not only UI); local
client checks pass. Signed device builds and staging checks are completed only
after the full local acceptance gate.

### Phase 7 — Administration, trust, safety, and support

- [ ] Complete admin dashboards for jobs, accounts, organizations,
      applications (only where operationally justified), reports, verification
      queues, and audit history.
- [ ] Define least-privilege admin roles, sensitive-action confirmation,
      reason capture, immutable audit logging, and emergency access process.
- [ ] Add report-job/company/user intake, triage, action, appeal, and reporter
      feedback states with abuse prevention.
- [ ] Define fraud/scam handling and response procedures for suspicious
      listings, impersonation, spam, and compromised accounts.
- [ ] Publish real About, Help/Support, Privacy, Terms, employer contact, and
      reporting destinations. Add a support contact and response ownership.
- [ ] Implement account export/deletion and data retention behavior as
      approved by legal/privacy stakeholders, including backup retention
      implications.
- [ ] Ensure verification, freshness, match, salary, and performance claims
      are based on traceable real data; do not fabricate them.

**Exit gate:** Support and moderators can process a report end-to-end with
least privilege and auditable outcomes; user data requests follow documented
retention/privacy policy; public trust claims are evidence-backed.

### Phase 8 — Full local verification, then controlled release

**Local test gate (must pass before any staging or public deployment)**

- [ ] Run the complete test suite locally against isolated databases and
      synthetic candidate, employer, admin, job, and application data.
- [ ] Complete end-to-end tests across web, API, admin, database, uploads,
      email capture/sandbox, and push sandbox/test mode.
- [ ] Test candidate registration-to-application, employer
      organization-to-hiring, admin moderation, account recovery/deletion,
      duplicate requests, permissions, and tenant isolation.
- [ ] Test responsive web layouts and accessibility; test Android locally and
      iOS through Expo Go where possible. Record the limits of simulator/Expo
      Go coverage and schedule signed device tests after the local gate.
- [ ] Run formatting, lint, type checks, unit/integration/contract tests,
      production builds for web/API, and available mobile checks. No known
      failing test may be waived without a recorded owner and approval.
- [ ] Run a local security assessment covering authentication/session
      handling, authorization/tenant isolation, injection, rate limiting,
      uploads, secrets, dependencies, privacy leakage, and admin abuse paths.
- [ ] Test local database migrations from a clean database and from the
      supported previous schema; verify seed/demo data cannot enter production.
- [ ] Confirm no credentials, personal data, resumes, tokens, or sensitive
      request bodies appear in source control, logs, analytics, or test reports.
- [ ] Record test results, unresolved risks, known limitations, and an explicit
      local acceptance sign-off.

**Exit gate:** All agreed local acceptance tests pass, critical/high launch
blockers are resolved or explicitly accepted by the product owner, and the
local test report is reviewed. Do not start a public deployment before this
gate.

**Non-public staging gate (only after local sign-off)**

- [ ] Deploy to access-controlled staging with isolated credentials and
      synthetic data; staging is not the public launch.
- [ ] Validate HTTPS, domains, provider callbacks, object storage, email/push
      sandbox delivery, signed iOS/Android builds, deep links, and real-device
      behavior that local-only testing cannot fully verify.
- [ ] Test migration on a production-like copy, backup restore,
      rollback/forward-fix procedures, key rotation, and disaster recovery.
- [ ] Load-test job search, sign-in, application submission, employer inbox,
      and upload paths at agreed launch traffic; resolve bottlenecks.
- [ ] Confirm measured service objectives, dashboards, alerts,
      on-call/escalation owner, incident process, and user-facing
      maintenance/error messaging.
- [ ] Add privacy-reviewed product analytics for agreed funnel and quality
      measures; never log passwords, tokens, resume contents, or unnecessary
      personal data.
- [ ] Complete privacy/security review, support readiness, store disclosures,
      listing material, and staged rollout/rollback plan.

**Public production release (requires explicit approval)**

- [ ] Confirm local and staging gates are signed off; obtain product-owner
      approval for the specific web/API/mobile versions being released.
- [ ] Run a limited pilot with real candidates and employers only after public
      deployment is authorized; resolve critical workflow blockers before
      broad rollout.
- [ ] Release web/API and mobile stores progressively where supported; monitor
      user feedback, crashes, errors, and support reports and keep a rollback
      or disable plan.
- [ ] Review launch metrics and feedback; prioritize improvements from
      evidence. Revisit monetization only after the free launch is validated.

**Public launch exit gate:** No unresolved critical launch blockers; local and
staging evidence, security/privacy review, restore/rollback drills, monitoring,
support coverage, store submission materials, and product-owner approval are
recorded and owned.

## 5. Cross-cutting quality and acceptance standards

Apply throughout every phase, not as a final cosmetic pass.

### Functional correctness

- Every create/update/delete action has server-side validation,
  authorization, confirmation, and a recoverable error state.
- Idempotency or duplicate protection exists for retryable operations such as
  application submission, invitations, and uploads where applicable.
- State changes are explicit and auditable; time, currency, location, and
  salary units are unambiguous.
- Empty, loading, stale, offline, unauthorized, not-found, rate-limited, and
  server-failure cases are designed and tested.

### Security and privacy

- Deny access by default; enforce role, ownership, and organization boundaries
  in API services and tests.
- Use HTTPS; secure cookies for browser sessions; short-lived access tokens;
  refresh-token rotation/revocation; secure native credential storage.
- Validate and normalize input; protect against injection, mass assignment,
  CSRF where cookie-authenticated writes require it, brute force, and
  enumeration.
- Keep resumes private and restrict download to authorized viewers; limit file
  size/type, use safe storage keys, and define scanning/retention.
- Apply least privilege to staff, cloud services, CI, and deployment secrets.
- Minimize personal data in logs/analytics; encrypt data in transit and use
  provider/database encryption at rest where available.
- Maintain dependency updates, secret scanning, audit trails, incident
  response, data retention/deletion, and privacy review.

### Accessibility, compatibility, and performance

- Meet WCAG 2.2 AA as the target for web interactions; use native accessibility
  semantics and screen-reader testing on mobile.
- Support keyboard-only use on web, visible focus, reduced motion, scalable
  text, sufficient contrast, and usable touch targets.
- Agree supported browser, Android/iOS version, and device-size matrix before
  release; test physical devices, not only emulators/simulators.
- Establish measurable targets before launch (suggested starting targets:
  public web Core Web Vitals in the “good” range at the 75th percentile, API
  p95 below 500 ms for ordinary reads under the agreed load, and monthly
  availability target of 99.5%). Use local tests for functional/performance
  baselines; verify internet-facing targets in non-public staging and
  production after approval.

### Test strategy

- Unit tests for domain rules, state transitions, authorization policies, and
  validation.
- API integration tests for database migrations, ownership/tenant isolation,
  session lifecycle, files, rate limits, and error contracts.
- Contract tests ensuring generated clients match OpenAPI.
- Web and mobile component/interaction tests for forms, navigation, errors,
  offline behavior, and accessibility.
- End-to-end tests for candidate registration-to-application, employer
  organization-to-hiring, admin moderation, and account deletion.
- Manual release checks for real devices, store builds, deep links, push
  permission behavior, and assistive technology.

## 6. India-first and expansion readiness

- Use a single internally consistent time model (UTC instants plus explicit
  display timezone) and define India display behavior.
- Store compensation as numeric values plus currency and pay period; never
  infer currency or salary period from formatting.
- Model addresses/location separately from display strings enough to support
  additional countries; define whether location search is city-, region-, or
  radius-based.
- Define phone-number normalization and verification policy before relying on
  phone as an account identifier.
- Avoid assuming all users have reliable connectivity, high-end devices, or
  large data plans; keep mobile payloads efficient and uploads retryable.
- Make language, date/number formatting, legal copy, and country-specific
  validation configurable. Do not claim localization or legal compliance until
  reviewed and delivered.

## 7. Deployment and operations checklist

- [ ] Finish local development and the full local test gate before provisioning
      or deploying a public production service.
- [ ] Keep local, test/CI, staging, and production credentials/data isolated;
      only use synthetic data in local and staging.
- [ ] Store secrets in managed secret storage; rotate and audit access.
- [ ] After local sign-off, deploy API and web to non-public staging
      independently with health checks, logs, metrics, and rollback
      instructions. Deploy publicly only after staging acceptance and explicit
      product-owner approval.
- [ ] Restrict database networking and permissions; apply migrations as a
      deliberate release step with a tested recovery plan.
- [ ] Back up database and object metadata/files; regularly restore backups to
      prove recovery works.
- [ ] Monitor API availability/latency, failed logins, job publication,
      application failures, email/push delivery, storage errors, and mobile
      crashes.
- [ ] Define support ownership, escalation and incident communication.
- [ ] Maintain data deletion and retention procedures that include backups and
      vendor-held data.
- [ ] Use feature flags or controlled rollout for risky launches where
      appropriate; ensure flags do not replace authorization.
- [ ] Document the exact release artifact/version, migration, approver,
      deployment time, smoke-test evidence, and rollback decision for every
      production release.

## 8. iOS delivery from Windows (no physical Mac required to build)

Windows can be used for source development. Expo Application Services (EAS)
can perform iOS builds on hosted macOS infrastructure. Cloud builds do not
eliminate Apple account, signing, store review, or real-device test needs.

1. Install Node.js on Windows and create the Expo app. Use a browser and
   Android emulator/device for routine development; Expo Go on an iPhone is
   useful for early UI work but does not represent every production native
   capability.
2. Create an Apple Developer Program account and App Store Connect app record
   under the product owner's control; choose and reserve the bundle identifier.
3. Configure EAS development, preview, and production profiles. EAS can manage
   signing after Apple account authorization; protect credentials and never
   commit signing secrets.
4. Run cloud development/preview builds, then distribute a signed build via
   TestFlight for real-device validation. Arrange access to at least one
   compatible iPhone before a public release.
5. Complete App Store metadata, privacy disclosures, support/privacy URLs,
   screenshots, export/compliance questions, and review submission.
6. Upload with EAS Submit or App Store Connect, manage TestFlight/review in
   App Store Connect, and release gradually where available.
7. Keep build credentials, app identifiers, release profile, and recovery
   ownership documented for the organization, not a single developer.

Example only, after the Expo app and `eas.json` profiles exist:

```powershell
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform ios --profile preview
npx eas-cli submit --platform ios
```

Command options and signing requirements depend on the chosen profile and
Apple account. EAS builds are a practical Mac-free route; they do not make an
iPhone optional for reliable release testing. Apple program eligibility, fees,
review requirements, and policies can change; confirm current requirements
with Apple before release.

## 9. Delivery order and project tracking

Recommended sequence:

1. Discovery, policies, API contracts, environment/CI foundation.
2. API hardening and Next.js/Expo shells.
3. Public web search and job details.
4. Candidate account, profile, privacy, and resume.
5. Employer organizations, company profiles, and job lifecycle.
6. Saved jobs, applications, applicant review, and notifications.
7. Candidate and employer mobile feature parity.
8. Admin/moderation/support completion and production-readiness.
9. Pilot, store review, staged launch, and measured iteration.

For execution, break every unchecked item into a ticket with: owner,
prerequisites, API/UI/data deliverables, acceptance tests, security/privacy
impact, and completion evidence. Track blockers and decisions separately.
Do not mark a capability complete because a screen exists; its API, permission
checks, failure behavior, tests, observability, and support process must also
be ready.

## 10. Decisions to revisit before committing dates

- Validate candidate and employer demand, core launch cities/industries, and
  job acquisition strategy; a portal needs credible job supply as well as
  software.
- Confirm employer mobile scope in user research. This roadmap includes core
  employer mobile management; if usage data does not justify it, ship a
  responsive employer web workflow first and record that as an explicit
  release tradeoff.
- Confirm the initial language(s), phone/email verification requirements, and
  legal/privacy review with qualified advisors.
- Confirm hosting and data-residency requirements, budget, expected launch
  traffic, backup objectives, support hours, and incident owner.
- Confirm which notification channels and application states deliver real
  value before building provider integrations.
- Revisit paid employer features only after validating the free product and
  deciding billing, tax/invoice, refund, and support requirements.
