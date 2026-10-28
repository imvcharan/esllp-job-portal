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
- **Web:** Complete and verify the current responsive web portal first.
  Reassess a Next.js/React/TypeScript migration after the existing web journeys
  meet the local acceptance gates.
- **Mobile:** React Native/Expo for iOS and Android is a follow-on workstream,
  not a prerequisite for the responsive-web-first release.
- **Backend:** Keep the existing NestJS API and extend it; do not rewrite it or
  split it into microservices without evidence that the current architecture
  cannot meet a measured need.
- **Database:** Use PostgreSQL and TypeORM. Use reviewed schema migrations; never
  enable TypeORM schema synchronization in production.
- **Launch business model:** Paid employer plans are in scope. Keep paid
  checkout behind complete Razorpay configuration and staging verification;
  never imply that payment is available in an environment where it is not.
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

- Candidate and employer journeys are available on responsive web for the
  initial release; native apps are deferred.
- Admin/moderation functionality is web-only.
- English is the initial interface language unless product discovery changes
  that decision. Structure text and formatting for later localization; decide
  which Indian languages to support before committing translated content.
- Paid employer plans are in scope. Keep checkout unavailable until plan
  configuration, verified webhooks, and staging payment tests are complete;
  candidates are not charged to apply.
- Do not build unrequested social networks, AI ranking, automated hiring
  decisions, payroll, or background checks into v1.
- Email verification, password recovery, application messaging, push
  notifications, company verification, and report handling are real product
  flows only when their server and operations support is delivered. Never
  present a mock action as completed.

## 2. Technology and system shape

| Area                   | Direction                                                    | Notes                                                                                              |
| ---------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Public and account web | Current responsive client; reassess Next.js later            | Search-engine-friendly public job pages; responsive candidate and employer workspaces.             |
| iOS and Android        | React Native + Expo + TypeScript (follow-on)                 | Native candidate/employer app only after responsive-web release scope passes.                      |
| API                    | Existing NestJS + TypeScript                                 | REST API; server owns validation, permissions, and business rules.                                 |
| API contract           | OpenAPI and generated TypeScript client/models               | Web and mobile consume the same versioned contract; avoid hand-maintained duplicate request types. |
| Database               | PostgreSQL + TypeORM                                         | Use migrations, indexes, constraints, transactions, backups, and restore tests.                    |
| Uploads                | Private object storage                                       | Resume files are private; issue authorized, short-lived access, not public URLs.                   |
| Email and push         | Provider-backed adapters behind API modules                  | Select providers after delivery, cost, India availability, and privacy requirements are evaluated. |
| Admin                  | Existing protected admin/API foundations, expanded as needed | Continue enforcing server authorization; UI gating is not authorization.                           |
| Hosting                | Separate web, API, database, and object storage deployments  | Choose provider after region, budget, data residency, support, and traffic needs are confirmed.    |

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

This section records implemented repository capabilities, not production
readiness. The older status notes in this section were stale and contradicted
the current API and workflow guide; use the following baseline instead.

- NestJS serves the responsive static public/admin HTML and exposes the API
  under `/api`. The Next.js migration and Expo mobile clients remain planned.
- Candidate/employer registration, login, refresh-cookie rotation, logout,
  email verification, password recovery, forced password changes, role guards,
  and rate limits are implemented. SMTP delivery still requires deployment
  configuration and verification.
- Public job search supports filtering, sorting, pagination, share pages,
  sitemap, and structured data. Admins manage listings; approved employers
  manage organization-owned jobs and company details.
- Candidate profile and preferences, private photo/resume storage, saved jobs
  and searches, consent-based application data sharing, application history
  and withdrawal, notifications, and interview updates are implemented.
- Employer organization membership, invitations, applicant review/status
  changes, notes/tags, interviews, notifications, plan limits, and Razorpay
  subscription flows are implemented. Paid checkout still requires configured
  plans, verified webhooks, and staging checks.
- Staff/admin/superadmin dashboards, employer approval, user administration,
  analytics, and the protected audit log are implemented.
- TypeORM migrations and PostgreSQL configuration exist; startup runs pending
  migrations. The existing backend and static web client are the supported
  local product surfaces.
- Repository gaps still include database integration/browser end-to-end tests,
  company/user reporting controls and appeal/feedback workflows, an approved
  account deletion/retention policy, malware scanning/quarantine for uploads,
  and complete operational observability/recovery/support readiness.
  Provider-backed production configuration and verification are not evidenced
  by repository code.
- See [README.md](./README.md) for setup, API, storage, email, billing, and
  deployment configuration details.

Do not remove an existing screen/API until the replacement has parity for its
required behavior, permission checks, tests, and operational ownership.

## Local-first release rule

Build and verify the product against a local development server first. Do not
deploy a public website/API, publish an App Store or Play Store release, or
point real users at the product until the local acceptance gates in this
roadmap pass and the product owner explicitly approves the release.

- Local is the first complete integration environment: API, database,
  responsive web, admin, uploads, and test email/notification behavior must
  work together using non-production accounts and synthetic data. Mobile is
  deferred from the initial release scope.
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
- [x] Add a CI build-and-unit-test gate on pushes and pull requests; keep
      environment credentials out of Git.
- [ ] Extend CI with formatting, lint, explicit type-check, API/database
      integration, browser, and mobile checks.
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

### Phase 1 — API hardening and responsive-web foundation

**Deliver**

- [ ] Audit current API behavior, auth/session handling, migrations, CORS,
      cookies, request validation, throttling, error responses, and admin
      authorization. Fix launch blockers before adding clients.
- [ ] Add OpenAPI generation and a checked/generated TypeScript client, plus
      contract checks that fail when clients and API drift.
- [x] Implement the browser session flow using short-lived access tokens and
      an HttpOnly refresh cookie that is Secure in production.
- [ ] Complete an API/authentication review and add contract documentation;
      native credential storage applies only if mobile is later approved.
- [x] Keep the static responsive client and API same-origin in the local
      NestJS app; document the API origin if a separate frontend is introduced.
- [ ] Add common design tokens, typography, responsive breakpoints, form
      patterns, accessible controls, error/empty/loading states, and analytics
      event conventions.
- [ ] Add request IDs, structured logs, health/readiness checks, and a safe
      error-reporting strategy that excludes credentials, tokens, and resume
      content.

**Exit gate:** The responsive web client runs against the local API; auth
behavior is documented and tested; local development uses no production
secrets or data. A staging deployment is not a prerequisite for feature work.

### Phase 2 — Public discovery and job-search web

**Deliver**

- [x] Implement public homepage, search results, filters, sorting, pagination,
      and job-detail routes against the jobs API in the current responsive web
      client.
- [x] Add shareable job pages, canonical metadata, sitemap, and structured
      data for public listings.
- [x] Keep search and filters URL-addressable and preserve direct job links.
- [x] Handle no results, API failures, unavailable listings, and preview-only
      sample jobs without treating samples as actionable vacancies.
- [x] Support job content including salary/currency/pay period, location/work
      arrangement, application deadlines, and publication status.
- [ ] Add browser-level route, SEO, and search acceptance tests.
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
- [x] Extend profiles with experience, education, desired role titles, and
      employment/workplace preferences.
- [ ] Add optional compensation expectations to candidate profiles.
- [x] Add profile/application audit events and enforce candidate consent for
      employer visibility.
- [x] Implement email verification and password recovery with expiring,
      single-use tokens, rate limits, and safe responses. Provider delivery
      monitoring/retry remains a release task.
- [x] Implement private resume upload/replacement/removal and authorized
      download using object storage with file size/type validation and private
      storage paths.
- [ ] Configure malware scanning/quarantine for uploaded files before
      production use.
- [ ] Define approved retention, anonymization, and deletion behavior for
      candidate data/files and legal holds. A candidate export and
      superadmin-reviewed deletion-request queue exist; requests do not delete
      accounts or files.

**Clients**

- [x] Build web sign-up, sign-in, logout, password visibility, validation,
      refresh-cookie session restoration, and role-based dashboard routing.
- [x] Add email verification and password recovery screens for the available
      backend flows.
- [x] Build a responsive candidate profile editor with server-backed save,
      session refresh/recovery, and honest private-by-default disclosure.
- [x] Show profile completeness feedback based on saved profile data.
- [ ] Build guided save-and-resume onboarding and a candidate profile preview.
- [x] Add privacy/visibility controls with a clear explanation of when an
      employer can access profile or resume information.
- [x] Add resume file constraints, replacement/removal, and actionable error
      states.
- [ ] Add upload progress and retry behavior.

**Exit gate:** A candidate can securely register, recover access, manage a
persisted profile/resume, and control visibility on web; unauthorized accounts
cannot read or modify another candidate's data; files are private and tested.

### Phase 4 — Employer organizations, company pages, and job management

**API/data**

- [x] Add employer onboarding, organization/company records, memberships,
      invitation acceptance/revocation, and role-based permissions.
- [x] Enforce tenant isolation: every organization-scoped operation verifies
      both membership and the required permission.
- [ ] Define a complete employer verification/moderation policy with evidence,
      review ownership, appeal path, and public badge rules. Current email
      verification and admin approval are implemented.
- [x] Support core job listing fields for location,
      work arrangement, employment type, experience, compensation, application
      visibility, publication, and expiry.
- [ ] Add application questions and explicit moderation/pause/rejection
      transitions. Current job states cover draft, active/published, closed,
      expired, and archived behavior; changes are audited.
- [x] Add bounded job-search pagination and database indexes for core lookup.
- [ ] Test query behavior with realistic data volume.

**Clients**

- [x] Build company setup/edit, team/member management, job posting, draft
      save, preview, publish, edit, and close flows on web.
- [ ] Build company public pages using employer-supplied data and clearly
      sourced verification status.
- [x] Keep public job search and job details aligned with server publication
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
- [x] Define application eligibility, optional note, consent choices,
      duplicate behavior, withdrawal rules, and application profile snapshots.
- [ ] Add employer-defined application questions and required documents.
- [x] Add application, status-history, and event records. Enforce
      candidate ownership and employer tenant access on every operation.
- [x] Define and enforce the status lifecycle (submitted, in review,
      interview, offer response, rejected, withdrawal request/confirmation)
      and permitted transitions; synchronize interview scheduling with stage.
- [x] Add an audit trail for employer decisions and access to sensitive
      application/resume data.
- [x] Add in-app notifications for application status, offers, messages,
      withdrawals, and interviews; respect candidate email preferences.
- [ ] Add delivery retry/deduplication and push notification handling.

**Clients**

- [x] Build account-synced candidate job saving and a saved-jobs workspace
      page with published-job details and removal. Guest and preview saves
      remain browser-local; published guest saves sync on sign-in.
- [x] Build candidate application submission with an optional validated note;
      show success only after an API response and keep retries idempotent.
- [x] Build candidate application history with status history and job links.
- [x] Add a review-and-confirm step, clear account-name disclosure, opt-in
      profile sharing, optional resume attachment, withdrawal requests, and
      reapplication after confirmed withdrawal.
- [x] Add employer-driven status updates, status explanations, and notification
      preferences.
- [x] Build employer applicant inbox with job context, filtering/search,
      pagination, authorized candidate/application detail, and resume access.
- [x] Add stage changes, notes, tags, status history, synchronized interview
      scheduling, candidate/employer messaging, and offer response tracking.
- [x] Provide privacy notices and limit candidate data to application
      workflow requirements.

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

- [x] Provide protected admin dashboards for jobs, accounts, organizations,
      reports, employer approvals, analytics, and audit history.
- [ ] Complete application-specific admin moderation queues where
      operationally justified.
- [x] Enforce role-restricted admin actions and immutable audit logging.
- [ ] Add sensitive-action reason capture and an emergency access process.
- [ ] Complete report job/company/user intake, appeal, and reporter feedback
      states with abuse prevention. Job reports have a web intake form;
      authenticated API intake supports job/company/user targets; admins can
      triage, action, or dismiss. Public company/account report controls,
      appeals, and reporter feedback are not implemented.
- [ ] Define fraud/scam handling and response procedures for suspicious
      listings, impersonation, spam, and compromised accounts.
- [ ] Publish real About, Help/Support, Privacy, Terms, employer contact, and
      reporting destinations. Add a support contact and response ownership.
- [x] Add candidate JSON data export and a superadmin-reviewed deletion request
      queue.
- [ ] Define approved account deletion/anonymization, data retention, and
      backup/vendor data handling with legal/privacy stakeholders; implement
      the approved policy. The current deletion-request workflow does not
      delete or anonymize data.
- [ ] Ensure verification, freshness, match, salary, and performance claims
      are based on traceable real data; do not fabricate them.

**Exit gate:** Support and moderators can process a report end-to-end with
least privilege and auditable outcomes; user data requests follow documented
retention/privacy policy; public trust claims are evidence-backed.

### Phase 8 — Full local verification, then controlled release

**Local test gate (must pass before any staging or public deployment)**

- [ ] Run the complete test suite locally against isolated databases and
      synthetic candidate, employer, admin, job, and application data.
- [x] Add an initial GitHub Actions build/unit-test job and eight focused
      service-level tests. Database integration and browser end-to-end tests
      are still missing.
- [ ] Complete end-to-end tests across web, API, admin, database, uploads,
      email capture/sandbox, and push sandbox/test mode.
- [ ] Test candidate registration-to-application, employer
      organization-to-hiring, admin moderation, account recovery/deletion,
      duplicate requests, permissions, and tenant isolation.
- [ ] Test responsive web layouts and accessibility. Native Android/iOS checks
      are deferred until native apps are approved.
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
- [ ] Release the responsive web/API progressively; monitor user feedback,
      errors, and support reports and keep a rollback or disable plan. Mobile
      store release is deferred.
- [ ] Verify paid plans, displayed pricing, Razorpay webhooks, cancellation,
      and failure handling in staging before enabling checkout for real users.
- [ ] Review launch metrics and feedback; prioritize improvements from
      evidence.

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
2. API hardening and local CI/test coverage.
3. Verify the existing responsive web search and job-detail flows.
4. Candidate account, profile, privacy, and resume.
5. Employer organizations, company profiles, and job lifecycle.
6. Saved jobs, applications, applicant review, and notifications.
7. Complete report handling, privacy policy, and admin/support workflows.
8. Reassess mobile apps after responsive-web acceptance; native clients are
   deferred from initial scope.
9. Complete local/staging release gates and paid-plan verification, then pilot
   and iterate.

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
- Reassess native candidate/employer mobile scope after responsive-web
  acceptance; mobile is explicitly deferred from initial scope.
- Confirm the initial language(s), phone/email verification requirements, and
  legal/privacy review with qualified advisors.
- Confirm hosting and data-residency requirements, budget, expected launch
  traffic, backup objectives, support hours, and incident owner.
- Confirm which notification channels and application states deliver real
  value before adding push delivery.
- Confirm paid-plan pricing, tax/invoice, refund, and billing-support
  requirements before enabling Razorpay for real users.
