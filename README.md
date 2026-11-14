# esllp Job Portal

NestJS serves the homepage from `public/index.html`, the admin dashboard from `public/admin/index.html`, and exposes the job API at `/api/jobs`. TypeORM connects to PostgreSQL using the `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DATABASE` environment variables, or a `DATABASE_URL`. The application runs pending schema migrations automatically at startup.

## Requirements

- Node.js 20.9 or newer (Node.js 24.x is supported)
- npm

## Local PostgreSQL database (Windows)

Install and start PostgreSQL before running the application. A separate
webserver is not required: NestJS serves the website and API itself.

Create a dedicated application account and database using `psql` or
pgAdmin (replace the placeholder password with a unique value):

```sql
CREATE ROLE esllp_app WITH LOGIN PASSWORD '<unique random password>';
CREATE DATABASE esllp_job_portal OWNER esllp_app;
```

The application connects as `esllp_app`, not as a PostgreSQL superuser. Local
database credentials and a random development JWT secret belong in the
Git-ignored `.env` file, never in committed source. Configure:

```dotenv
PORT=3000
NODE_ENV=development
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_USER=esllp_app
POSTGRES_PASSWORD=<locally generated database-user password>
POSTGRES_DATABASE=esllp_job_portal
POSTGRES_SSL=false
JWT_ACCESS_SECRET=<unique random secret of at least 32 characters>
```

On this development machine port `3000` is used by another local service; its
`.env` therefore sets `PORT=3001`. Keep the port free on your machine and use
the value configured in `.env`. Never copy the generated local `.env` into
source control or production.

Put the same generated database-user password in `.env`. Then run migrations
and start the local app:

```powershell
npm run migration:run
npm run build
npm run bootstrap:superadmin
npm run start:dev
```

Set `SUPERADMIN_NAME`, `SUPERADMIN_EMAIL`, and `SUPERADMIN_PASSWORD` in the
ignored local `.env` before bootstrapping. Use a password with at least 8
characters and no more than 72 UTF-8 bytes. The bootstrap command refuses to
promote an existing account or create another superadmin.

The NestJS app applies pending migrations on startup as well. For this local
setup, open `http://localhost:3001` when `.env` has `PORT=3001`; otherwise use
the configured port (3000 by default). Confirm `GET /api/jobs` responds before
testing account registration. Do not use production data in this local
database.

## Local development

```powershell
npm install
npm run start:dev
```

Open `http://localhost:3000` for the homepage or `http://localhost:3000/admin/` for the admin dashboard preview. The API is available at `http://localhost:3000/api/jobs`.

During non-production runs, interactive API documentation is available at
`http://localhost:3000/api/docs`, with the generated OpenAPI JSON at
`http://localhost:3000/api/openapi.json`. These documentation routes are disabled
when `NODE_ENV=production`.

Run the current build and unit tests before opening a pull request:

```powershell
npm test
```

The command builds the NestJS application and runs the Node.js test suite.
GitHub Actions runs the same command on pushes and pull requests; full database
integration and browser end-to-end coverage are still required before release.

The admin dashboard includes live overview metrics, job management, candidate account records for superadmins, employer organizations, application analytics, recent platform activity, account security, superadmin user management, and audit history. Counts and tables use database records; empty datasets show empty states instead of example people or invented metrics. Candidate account details, role/status controls, account creation, recent platform activity, and the security audit log remain restricted to their assigned roles. Account-list failures and timeouts are displayed in the table with retry guidance instead of leaving the page in a permanent loading state.

The superadmin audit log records successful account, job, employer, candidate, and hiring-workflow changes plus login successes and failures. Records are append-only and include request IP address, user agent, and approximate city/region/country when a local MaxMind City database is configured. It supports search, action/country/date filters, pagination, and CSV export. It does not use browser GPS or send IP addresses to an external geolocation service.

Candidates can report a job listing from its detail page; staff, admins, and
superadmins can review and disposition reports in the admin Reports queue.
Report creation and status changes are audit logged. Company/account reports
are accepted by the authenticated reports API, but the public web interface
currently exposes reporting for job listings only. Candidates can download a
JSON export of their profile, applications and status history, offer details
and responses, application messages, saved jobs, saved searches, notifications,
application-document metadata, and deletion requests; storage paths and
temporary file links are excluded. Deletion requests remain subject to
superadmin review and do **not** automatically delete or anonymize an account.
When an eligible unlinked candidate account is permanently deleted, its
application documents and resume-version files are purged from private object
storage before the database account is removed. Linked business records still
block permanent deletion and must be handled under the approved retention
process. Document the database provider's actual backup expiry before launch;
deletion from backups follows that provider's expiry schedule.

Candidate profile settings include education, work history, skills,
certifications, salary/location preferences, recruiter visibility, and a
separate recruiter-contact permission. Resume uploads support PDF/DOCX parsing,
private version history, and a browser-printable resume builder. Candidates can
see explainable job recommendations and interview details. Optional candidate
services are available as one-time purchases: resume review (default ₹499),
30-day profile boost (default ₹299), and career consultation (default ₹1,499).
These editable defaults are illustrative, not market-validated. Superadmins
can change prices, descriptions, availability, and boost duration in the
Candidate services dashboard. Applications and core job-seeking features
remain free. Razorpay verifies each payment server-side; profile boosts are
activated automatically without overriding candidate visibility/contact
settings, while resume-review and career-consultation requests require manual
fulfillment tracking by a superadmin. Configure the existing server-side
`RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` before enabling live checkout.

The candidate workspace includes a four-step guided setup. Each step saves
profile fields and the current onboarding position through
`PUT /api/candidate/profile`; returning candidates resume from that saved position.
Skipping the optional experience/education step is supported, and profile
visibility remains private by default. Migration
`1729000000034-CandidateOnboardingProgress` adds the bounded progress field.

Approved employer job managers can bulk import up to 50 jobs at a time from the
Hiring workspace's CSV template. Imports are validated by the API, saved
transactionally as private drafts, and audit logged; each job must still be
reviewed and explicitly published. Supported CSV columns are `title`,
`location`, `workplaceType`, `employmentType`, `salaryMin`, `salaryMax`,
`salaryCurrency`, `salaryPeriod`, `applicationDeadline`, `numberOfOpenings`,
`experience`, and `description`.

To enable geographic labels, obtain and license a MaxMind GeoLite2 City database, store its `.mmdb` file outside the repository, and set `GEOIP_DATABASE_PATH` to that local file path. The database itself is ignored by Git. Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse proxies before the app when deployed behind a proxy so request IPs are resolved correctly; leave it at `0` for direct connections. Without a local database, audit events still keep the request IP and client user agent, while location is shown as unavailable.

## Authentication and superadmin

Copy `.env.example` to `.env`, configure the PostgreSQL connection values, set a unique `JWT_ACCESS_SECRET` (at least 32 characters), and configure the superadmin name, email, and a unique password (at least 8 characters and no more than 72 UTF-8 bytes). `.env` is ignored by Git and must not be committed.

After building, create the first superadmin once:

```powershell
npm run build
npm run bootstrap:superadmin
```

The command runs pending migrations and creates the superadmin only if no account already uses that email and no superadmin exists. It never promotes an existing account or resets credentials. The password is stored as a bcrypt hash. Do not use the example values in production.

Alternatively, first-time setup can be completed through `/setup-superadmin/`
after deploying the application. Open the page over HTTPS and enter the same
name, email, and password configured as `SUPERADMIN_NAME`,
`SUPERADMIN_EMAIL`, and `SUPERADMIN_PASSWORD` in the deployment environment.
The endpoint checks those values, creates a verified superadmin only if none
exists, and uses a database advisory lock to prevent concurrent first-account
creation. The page and endpoint are unavailable when the required deployment
values are unset or a superadmin already exists.

Run the command once against each environment's own database. For production,
set `SUPERADMIN_NAME`, `SUPERADMIN_EMAIL`, and `SUPERADMIN_PASSWORD` as
deployment secrets, then run `npm run bootstrap:superadmin` in the deployed
application environment after building. Keep production and local databases
separate; never commit or reuse a default password. Use the configured email
and password to sign in at `/admin/` on each server. The browser setup form
requires the configured name, email, and password; never put passwords in
source code or commit them. Change the password later from Settings → Account
security; the dashboard signs out after a successful change.

Authentication routes:

- `POST /api/auth/register` — public candidate registration; requires an 8-character minimum password and an E.164 mobile number
- `GET /api/auth/config` — public sign-in configuration, including the Google web client ID when configured
- `POST /api/auth/email-otp/request` and `POST /api/auth/email-otp/verify` — request and exchange a short-lived sign-in code for a verified candidate account
- `POST /api/auth/google` — link/sign in to an existing candidate account using a Google Identity Services ID token; new accounts must complete email/mobile registration
- `GET /api/auth/bootstrap-superadmin/status` and `POST /api/auth/bootstrap-superadmin` — one-time first-superadmin setup; checks the configured superadmin name, email, and password and is disabled after a superadmin exists
- `POST /api/auth/register/employer` — employer registration request with company name/website and E.164 mobile; email/mobile verification is required before sign-in, and administrator approval is required before write access
- `POST /api/auth/login` — issues a short-lived bearer access token and an HttpOnly, SameSite=Strict refresh cookie
- `POST /api/auth/refresh` — rotates the refresh token and issues a new access token
- `POST /api/auth/logout` — revokes the refresh session
- `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` — request and consume one-time password-reset links
- `POST /api/auth/verify-email` and `POST /api/auth/resend-verification` — verify a new account or request another link
- `POST /api/auth/phone-verification/request|verify` — resend or verify the new-account SMS code
- `POST /api/auth/phone/change/request|verify` — stage and verify a signed-in user's new mobile number
- `PUT /api/auth/me/username` — update the signed-in user's unique username
- `GET /u/:username` — opt-in candidate profile page; employer usernames redirect to their company page
- `POST /api/auth/change-password` — change the signed-in user's password and revoke refresh sessions
- `GET /api/auth/me` — current user (bearer token required)
- `GET /api/candidate/profile` — read the authenticated candidate's profile and saved onboarding position
- `PUT /api/candidate/profile` — create/update the authenticated candidate's profile and onboarding position (steps 1–5)
- `GET /api/candidate/profile/resume-versions` and `POST /api/candidate/profile/resume-versions/:id/restore` — list private resume versions and restore one as current
- `GET /api/candidate/recommendations` — return explainable job matches based on profile and salary preferences
- `GET /api/candidate/interviews` — list the candidate's interview schedule and joining details
- `GET /api/candidate/premium` — available candidate services, order history, and boost status
- `POST /api/candidate/premium/checkout` and `POST /api/candidate/premium/verify` — create and server-verify a one-time Razorpay order
- `POST /api/billing/razorpay/candidate-webhook` — verify Razorpay `payment.captured` events and reconcile candidate orders when the browser callback cannot finish
- `GET /api/employer/candidates?q=...` — Boolean-search profiles opted into recruiter visibility using `AND`, `OR`, `NOT`, parentheses, quoted phrases, and implicit `AND`; email/phone are returned only when the candidate also permits contact
- `POST /api/employer/candidates/:candidateId/resume` — issue a five-minute signed resume link only when that candidate separately opted in; consumes one monthly organization credit per candidate and records an audit event
- `GET /api/candidate/saved-jobs` — list jobs saved to the authenticated candidate's account
- `POST /api/candidate/saved-jobs/:jobId` — save a currently published job; safe to retry
- `DELETE /api/candidate/saved-jobs/:jobId` — remove a saved job
- `GET|POST /api/candidate/saved-searches` — list or save up to 25 searches, including supported job filters and optional instant email alerts
- `PATCH|DELETE /api/candidate/saved-searches/:id` — update an owned saved search/alert preference or remove it
- `GET /api/candidate/applications?page=1&limit=20` — paginated applications as `{ items, total, page, limit }`
- `GET /api/candidate/applications/:jobId` — read that candidate's application as `{ application: ... }`, or `{ application: null }`
- `POST /api/candidate/applications/:jobId/quick-apply-preference` and `POST /api/candidate/applications/:jobId/quick-apply` — save explicit per-job resume/profile-sharing choices and submit with them only when the role has no questions or requested documents
- `GET /api/candidate/applications/:jobId/documents` and `POST /api/candidate/applications/:jobId/documents/:documentId` — list or securely upload a job-requested PDF/DOCX before applying; uploads are scanned and private
- `POST /api/candidate/applications/:jobId` — submit an application with optional note, resume inclusion, profile-sharing choices, and validated answers to employer-defined questions; safe to retry
- `POST /api/candidate/applications/records/:applicationId/withdraw` — request withdrawal at any active stage; the employer must confirm before the application is withdrawn
- `POST /api/candidate/applications/records/:applicationId/offer-response` — accept or decline a pending offer before its deadline
- `GET|POST /api/candidate/applications/records/:applicationId/messages` — read or send text messages on an owned application
- `GET /api/candidate/notifications?page=1` and `PATCH /api/candidate/notifications/:notificationId/read` — review and mark application, offer, message, and interview notifications read

Candidate profile routes require a candidate access token; profile data and files are private by default. Password-based candidate and employer registrations require both email-link
verification and a phone OTP before password sign-in. Phone numbers use
international E.164 format, are unique per account, and verification codes
expire after ten minutes with a five-attempt limit. Configure SMTP and the
server-only `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
`TWILIO_FROM_NUMBER` variables before accepting registrations, or configure
Twilio from the superadmin SMS settings at `/admin/#twilio-config`.
Database-stored auth tokens are encrypted with
`TWILIO_CONFIG_ENCRYPTION_KEY`; set a stable random value of at least 32
characters before saving a token. Environment credentials remain the fallback
when database values are not set. Phone changes are staged and do not replace
the existing verified number until the new number is confirmed. Google
sign-in can link existing accounts; new accounts must register with email and
phone so both contact methods are verified.

WhatsApp interview reminders are disabled by default. Candidates must opt in
from profile settings and have a verified phone; changing the verified phone
revokes that consent. A superadmin must enable WhatsApp reminders in
`/admin/#twilio-config`, configure a WhatsApp-enabled sender and approved
Twilio Content Template, and verify provider delivery. The template must use
variables `{{1}}` job title, `{{2}}` company, `{{3}}` interview time, and
`{{4}}` meeting link/location. Delivery uses the WhatsApp outbox with bounded
retries and clears recipient/content data after terminal delivery.

Public account actions use the Google reCAPTCHA v2 checkbox when configured.
Set `RECAPTCHA_SITE_KEY` and the server-only `RECAPTCHA_SECRET_KEY` together,
and set `RECAPTCHA_ALLOWED_HOSTNAMES` to the exact production hostnames. In
production, CAPTCHA-protected actions fail closed if the keys are not set;
local development can run without them. The public and admin sign-in entry
points share one flow so CAPTCHA and superadmin MFA are applied consistently.
Superadmins must enroll an authenticator at first sign-in and save the
one-time recovery codes offline. Set `MFA_CONFIG_ENCRYPTION_KEY` to a stable,
random server-only value of at least 32 characters before enabling enrollment;
changing it later makes stored authenticator secrets unreadable. Keep these
keys in deployment secrets, not in source control.

Candidate usernames are unique and editable; public candidate pages are
opt-in, and employers' username links redirect to their public company page.
The public profile excludes contact details, resumes, and application data.
Password reset, resend verification, and signed-in password change use one-time
tokens or session revocation. The web client routes candidate/employer accounts
to their role-specific workspace and admin/superadmin accounts to `/admin/`.

Admin API routes require a bearer access token. `STAFF`, `ADMIN`, and `SUPERADMIN` can manage job listings and view companies and aggregate analytics. Staff cannot access recent platform activity, user controls, or audit logs. Only `SUPERADMIN` can list and create managed accounts, change account roles/status, approve employers, and read audit logs. Superadmins can create employer, staff, or admin accounts (not superadmins); employer accounts start pending approval. Every provisioned account receives a temporary password and is forced to change it before accessing protected portal features. A newly created job is a draft (`isActive: false`) until an authorized user publishes it. Public job search returns active listings only. Admin UI access is gated at the browser and all admin data routes are independently authorization-checked by the API.

- `/api/admin/jobs` — list, create, edit, and archive jobs
- `/api/admin/employers` — list active employer accounts for authorized job assignment
- `/api/admin/users/:id/employer-approval` — superadmin approve/reject a verified employer registration
- `/api/admin/users` — paginated user list, superadmin-only account creation for employers/staff/admins, and role/status updates
- `/api/admin/audit-logs` — paginated superadmin audit log
- `/api/admin/insights` — aggregate counts and application stages, weekly application totals, and top roles
- `/api/admin/companies` — employer organizations with active job and team counts
- `/api/admin/activity` — recent activity summary without audit details or IP addresses

Candidates can save their current job-search query and filters from the results page, reopen saved searches from their workspace, and opt into instant emails when matching jobs are published. Alerts can be switched off or on per saved search; scheduled daily/weekly digests are not currently offered.

## Employer SaaS workspace

Employer registration creates a company organization and owner membership.
After verifying their email, a pending employer can sign in to a read-only
workspace overview, company profile, and job-listing view. Applicant details,
team and billing pages, and all write actions remain unavailable until an
administrator approves the account. Approved employer owners can create job
drafts, publish or close jobs, manage company details, and review applicants
for their organization. Active-job and seat quotas are managed in the superadmin Razorpay settings: Free has 1 job/1 seat,
and the illustrative defaults are Starter (₹2,999/month, 5 jobs/3 seats),
Growth (₹9,999/month, 25 jobs/10 seats), Business (₹24,999/month, 75 jobs/25
seats), and Enterprise (custom price, 1,000 jobs/100 seats). Illustrative
monthly resume-unlock credits are 0, 25, 100, and 500 respectively. Paid
quotas apply after Razorpay confirms subscription activation. Prices,
entitlements, and credits are admin-configurable; provider plan IDs and prices
must match. These amounts and limits are examples, not market-validated
commitments.

The hiring workflow includes paginated applicant search and filters, status
history, company-private notes and tags, candidate-consented profile/resume
access, two-way application messages, withdrawal-request review, interview
scheduling/cancellation, and offer summaries with candidate accept/decline
responses. A candidate's account name is always visible to the employer;
profile-sharing consent covers the additional profile snapshot and contact
details, and resume inclusion is a separate choice. Scheduling an interview
automatically moves eligible applications to the Interview stage. Employers
must add a job description of at least 100 characters before publication;
salary disclosure remains optional.

Company roles are owner, admin,
recruiter, hiring manager, and billing. Invitations are created by an active,
approved employer account. A new invitee can register directly from the
invitation link and verify their email; the read-only preview remains limited
until administrator approval. Invitations last 30 days and owners/admins can
resend them. Seat limits include pending invitations. Switching between
organizations is supported for users who belong to more than one company.

When a subscription is halted or cancelled, the organization returns to Free
capacity. The most recently created active jobs are retained up to that quota;
older excess jobs are closed automatically, and are not republished if the
paid plan is later restored.

Employer routes (bearer token required; organization-scoped routes accept
`X-Organization-Id`):

- `GET /api/employer/organizations` — list companies the employer can access
- `GET /api/employer/dashboard` — company hiring metrics and recent applicants
- `GET|PATCH /api/employer/company` — read or update company details
- `GET|POST /api/employer/jobs` and `PATCH /api/employer/jobs/:jobId` — list and manage company jobs, including up to 10 required/optional application questions and 5 required/optional PDF/DOCX documents
- `POST /api/employer/jobs/:jobId/publish` and `/close` — submit new or previously closed listings for administrator review, or close an approved listing
- `GET /api/employer/applications` — search/filter organization applicants
- `PUT /api/employer/applications/:applicationId/scorecard` — save the signed-in reviewer’s private 1–5 ratings and recommendation; scorecards are visible only to authorized members of the same company
- `GET|POST /api/employer/candidate-searches` and `DELETE /api/employer/candidate-searches/:searchId` — list/save/delete organization-scoped recruiter searches
- `PATCH /api/employer/applications/:applicationId/status` — update candidate stage
- `POST /api/employer/applications/:applicationId/offer` — send an offer summary with a response deadline; this does not generate a contract
- `POST /api/employer/applications/:applicationId/withdrawal` — confirm or decline a candidate withdrawal request
- `GET|POST /api/employer/applications/:applicationId/messages` — read or send application messages for an authorized hiring-team member
- `POST /api/employer/applications/:applicationId/notes` and `/tags` — add internal notes/tags
- `DELETE /api/employer/applications/:applicationId/tags/:tagId` — remove a tag
- `POST /api/employer/applications/:applicationId/interviews` — schedule an interview
- `GET /api/employer/interviews` and `POST /api/employer/interviews/:interviewId/cancel` — view/cancel interviews
- `GET /api/employer/team`, `POST /api/employer/team/invitations`, `POST /api/employer/team/:memberId/resend`, and `PATCH /api/employer/team/:memberId` — manage team access and resend expired invitations
- `POST /api/employer/team/accept` — accept a team invitation
- `GET /api/employer/notifications` and `PATCH /api/employer/notifications/:notificationId/read` — manage notifications
- `GET /api/employer/billing` — view plan, usage, and subscription status
- `POST /api/employer/billing/subscribe`, `/api/employer/billing/verify`, and `/api/employer/billing/cancel` — manage subscriptions
- `POST /api/billing/razorpay/webhook` — Razorpay subscription event endpoint (provider signature required)
- `GET /companies/:slug` and `/companies/id/:id` — public company profile with current public jobs and an explicitly sourced employer-account approval status
- `PATCH /api/admin/jobs/:id/moderation` — staff/admin/superadmin approval, rejection, or pause with a required reason and audit record
- `GET /api/admin/email-outbox` and `POST /api/admin/email-outbox/:id/retry` — review failed notification delivery metadata and manually retry a failed email (admin/superadmin)
- `GET /api/admin/notification-templates`, `PUT /api/admin/notification-templates/:key`, and `POST /api/admin/notification-templates/:key/reset` — superadmin-managed, reason-required, audited email templates for account access, applications, job alerts, interviews, and team invitations
- `GET|PUT /api/admin/platform-configuration` and `POST /api/admin/platform-configuration/reset` — superadmin-managed registration, approval, job taxonomy, and search suggestion defaults
- `GET /api/admin/revenue/employer-subscriptions` — superadmin-only employer subscription collection totals by currency, plan, and month
- `GET /api/admin/revenue/reconciliation` — superadmin-only latest-500 captured candidate-service and employer-subscription ledger entries, including Razorpay references and invoice IDs where recorded; this is not a live gateway reconciliation

### Razorpay configuration

Razorpay is optional for Free-plan use. To enable paid checkout:

1. Create monthly INR subscription plans in the Razorpay dashboard with amounts
   matching the admin-configured tiers. Initial illustrative defaults are
   Starter ₹2,999, Growth ₹9,999, Business ₹24,999, and Enterprise custom.
2. Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_PLAN_STARTER`, `RAZORPAY_PLAN_GROWTH`,
   `RAZORPAY_PLAN_BUSINESS`, and optionally `RAZORPAY_PLAN_ENTERPRISE` in the server
   environment. Configure `EMPLOYER_STARTER_PRICE_INR` and
   `EMPLOYER_GROWTH_PRICE_INR` and `EMPLOYER_BUSINESS_PRICE_INR` only as
   display values matching the plans;
   the API verifies these values match the monthly INR Razorpay plan amounts
   before creating a subscription.
3. Set `RAZORPAY_WEBHOOK_SECRET` and configure the Razorpay webhook URL as
   `https://<your-domain>/api/billing/razorpay/webhook`. Subscribe to the
   subscription activation, charge, resume, halt, cancel, and completion
   events. Webhook signatures are verified against the raw request body and
   event IDs are recorded transactionally for retry-safe processing.
4. Configure a second Razorpay webhook pointing to
   `https://<your-domain>/api/billing/razorpay/candidate-webhook`, using the
   same `RAZORPAY_WEBHOOK_SECRET`, and subscribe to `payment.captured`.
   Candidate catalog prices are managed in the superadmin Candidate services
   dashboard and are charged as one-time INR payments.
5. Test subscription and candidate checkouts and webhook delivery in Razorpay test mode against staging
   before using live keys. Never put API secrets or webhook secrets in browser
   code or commit them.

Superadmins can also manage the Razorpay key ID, API secret, shared webhook
signing secret, paid plan IDs and prices, plus each paid plan's active-job and
seat limits under **Razorpay
settings** in the admin dashboard. API and webhook secrets are encrypted at
rest and are never returned to the browser. To enable saving secrets through
the dashboard, configure `RAZORPAY_CONFIG_ENCRYPTION_KEY` as a stable random
value of at least 32 characters (for example, generate one with
`openssl rand -base64 32`). Back it up securely and keep it unchanged: saved
secrets cannot be decrypted if this key is lost or rotated. Legacy `RAZORPAY_*`
environment settings remain supported as fallback values. Use the dashboard
Test API connection action before enabling checkout. Starter, Growth,
Business, and Enterprise subscriptions all require matching monthly INR plans
in Razorpay. Do not deploy paid
checkout until credentials, plan IDs/prices, both webhook endpoints, and
staging verification are complete.

## Backend implementation status

This is not yet a complete production job portal. The admin UI uses live data for job listings, organizations, aggregate application metrics, activity, superadmin-visible user accounts, and audit events. Job listings include optional application deadlines, opening counts, and salary currency/pay period; expired listings are hidden from public search and cannot accept applications. Candidate accounts have a private profile editor, interactive photo crop, private PDF resume storage, experience and education history, career preferences, professional links, saved jobs/searches, and application tracking. Candidates can independently choose to attach their current resume and share a profile snapshot on each application; they can request withdrawal at any active stage, with employer confirmation required, and may reapply after confirmation while the job remains open. Approved employers have organization-scoped job management, applicant workflows, bulk status updates, team access, notifications, and interview scheduling. Employers always see the candidate's account name; additional profile details and resumes are shared only according to candidate consent. Application status emails, interview notices, and matching job alerts use SMTP. Production database, SMTP, Supabase Storage, Razorpay, backups, and deployment still require configuration and staging verification.

Before production, configure HTTPS, establish PostgreSQL backups/restore tests, test SMTP delivery, apply migrations against a staging database, and arrange security review and superadmin MFA. Validate Razorpay plans, displayed prices, webhooks, subscription changes, cancellation, and payment failure handling in staging before enabling paid checkout. Establish monitoring/alerting, incident ownership, customer-support response ownership, and recovery procedures. Configure and verify malware scanning/quarantine for uploads before accepting real resumes. Review the Privacy and Terms pages against the business's actual data-retention, deletion, cookie/analytics, and service terms; the current pages are only high-level summaries.

Use HTTPS in production. The refresh cookie is marked Secure when `NODE_ENV=production`; production startup also refuses to run without a 32+ character `JWT_ACCESS_SECRET`.

Useful API routes:

- `GET /api/jobs/options` — public configured job categories, industries, employment/workplace types, and location suggestions
- `GET /api/jobs?page=1&limit=20` — paginated active jobs as `{ items, total, page, limit, companies }`
- `GET /api/jobs?q=designer&location=Bengaluru&page=1&limit=20` — search active jobs; category, industry, workplace, employment type, experience, company, salary, freshness, and sorting filters are supported as query parameters
- `GET /api/jobs/:id` — get an active job
- `GET|PUT /api/candidate/profile` — read or update the signed-in candidate's private profile
- `POST|DELETE /api/candidate/profile/photo` — upload a cropped photo or remove it
- `POST|DELETE /api/candidate/profile/resume` — upload a PDF/DOCX resume or clear the current resume
- `GET /api/candidate/profile/resume-versions` and `POST /api/candidate/profile/resume-versions/:id/restore` — list private resume versions and restore one as current
- `GET /api/candidate/recommendations` — return explainable job matches based on profile and salary preferences
- `GET /api/candidate/interviews` — list the candidate's interview schedule and joining details
- `GET /api/employer/candidates?q=...` — search profiles opted into recruiter visibility; email/phone are returned only when the candidate also permits contact
- `GET /api/candidate/account/export` — download the signed-in candidate's JSON data export
- `GET|POST /api/candidate/account/deletion-request` — view or submit a candidate deletion request for superadmin review; no data is deleted
- `POST /api/reports` — submit a job, company, or user report as a signed-in candidate/employer
- `GET /api/reports/mine` — list the signed-in reporter's report statuses and moderator-visible updates
- `GET /api/admin/reports` and `PATCH /api/admin/reports/:id` — staff/admin/superadmin report queue and moderation actions
- `GET /api/content?type=faq|blog|banner` and `GET /api/content/:slug` — published public content only; bodies are plain text
- `GET|POST /api/admin/content`, `PATCH /api/admin/content/:id`, `GET /api/admin/content/:id/revisions`, and `POST /api/admin/content/:id/revisions/:revisionId/restore` — staff/admin/superadmin content editing, scheduled publication, revision history, restore, and audit history
- `GET /pages/:slug` — server-rendered canonical metadata and escaped plain-text content for published pages, blog posts, and announcements
- `GET /jobs/categories/:slug` and `GET /jobs/locations/:slug` — taxonomy-driven, server-rendered job discovery pages with canonical metadata; matching pages are included in `/sitemap.xml`
- `GET /api/admin/privacy-requests` and `PATCH /api/admin/privacy-requests/:id` — superadmin-only candidate deletion-request review queue
- `GET /api/admin/candidate-premium/products`, `PATCH /api/admin/candidate-premium/products/:key`, `GET /api/admin/candidate-premium/orders`, and `PATCH /api/admin/candidate-premium/orders/:id/fulfillment` — superadmin-only candidate service pricing and fulfillment controls

The public homepage fetches published jobs from `/api/jobs` and includes URL-addressable search results and job detail views. Search, filters, sorting, and pagination are applied by the API, and clients receive bounded result pages. If an unfiltered request succeeds but the database has no published jobs, clearly labeled sample listings are shown as read-only previews. API errors are surfaced rather than silently presented as live data. Signed-in candidates save published jobs and searches to their account; guest and preview saves remain browser-local and are offered for sync at sign-in. Candidates choose whether to attach a resume or share a profile when applying, track the full status history, request withdrawal at any active stage, and may reapply after the employer confirms withdrawal while the job remains open. They can review and respond to employer-entered offer summaries before expiry and message the hiring team with text-only messages. Interview scheduling and cancellation appear in the candidate notification center. Employers review organization-owned job applications; status changes are audited in the application timeline and emailed when the candidate has enabled status notifications. Public share pages at `/share/jobs/:id` provide canonical metadata and `JobPosting` structured data. Category and location pages use the configured taxonomies and display matching published jobs; `/sitemap.xml` includes these pages when matching jobs exist, and `/robots.txt` references the sitemap. Set `PUBLIC_APP_URL` to the site's canonical absolute HTTP(S) origin for these endpoints and matching-job email links.

The admin Website content page manages public pages, FAQs, blog entries, and
announcements. New items are drafts until explicitly published. Public page and
blog links use `#content/:slug` in the SPA and `/pages/:slug` for a server-rendered
shareable page; FAQ and blog collections use `#faqs` and `#blog`. Published
pages and blog entries are included in `/sitemap.xml`. Content bodies are plain
text and are escaped in both web renderers; rich text, media uploads, and legal
review workflows are not included yet. Staff, admins, and
superadmins can schedule publication using the content editor's local time;
scheduled items remain hidden from public APIs, canonical pages, and the sitemap
until that time. Each create, edit, publish, and restore saves an immutable
content snapshot; editors can inspect the recent 100 revisions and restore one
without erasing newer history. Migrations
`1729000000033-CreateContentEntries` and
`1729000000035-CreateContentEntryRevisions` create the content and revision
tables on application startup.

## Production build

```powershell
npm run build
npm run start:prod
```

Configure `DATABASE_URL` or `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DATABASE` using the connection details from the hosting provider. Set `POSTGRES_SSL=true` if the provider requires TLS. If the provider uses a private database CA, download its root certificate and set the complete PEM value as `POSTGRES_SSL_CA`; certificate verification remains enabled. Keep credentials in the hosting provider's environment settings and never commit them. `PORT` is supplied by the hosting provider when applicable. The initial schema migrations run automatically when the application starts. Existing MySQL or local SQLite data is not copied automatically; export and import any data you need into PostgreSQL separately.

### Private candidate file storage

Candidate photo and resume uploads require Supabase Storage in addition to the PostgreSQL database:

1. In Supabase Storage, create a bucket named `candidate-private` and keep it **private**. Do not add public read policies.
2. Set the bucket file-size limit to at least 8 MB and allow only `image/webp`, `application/pdf`, and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
3. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the server's environment. Use a newly generated, server-only service-role secret; never put it in `public/`, a browser variable, or committed files. `SUPABASE_CANDIDATE_BUCKET` is optional and defaults to `candidate-private`.
4. Configure a reachable ClamAV `clamd` TCP service using `CLAMAV_HOST` and optional `CLAMAV_PORT` (default `3310`). Keep the scanner on a private network accessible only to the API. Production uploads fail closed if the scanner is missing or unavailable; detected files are rejected before storage. Photos are decoded, normalized and resized by the API; PDF/DOCX resumes are limited to 8 MB and parsed with bounded extraction. Stored files use owner-scoped object paths in the private bucket, with a retained version history. The API returns signed links that expire after five minutes. Scanned PDFs without selectable text need OCR and are rejected.

The candidate profile response can include section-based resume suggestions for skills, experience, and education. These heuristics only prefill the candidate's editable form; nothing changes on the server until the candidate reviews and saves. They are not AI-generated and may miss or misread resume content.

The profile/photo and profile/resume upload and delete endpoints require an authenticated candidate account. A resume is **not** automatically attached to an application; candidates choose whether to include it for each submission. Employer application access is restricted to assigned jobs. Recruiter-directory resume access is a separate candidate opt-in, requires the candidate to remain discoverable, spends one admin-configured monthly organization credit per candidate, and is audited; each resulting signed link expires after five minutes. Replacing/removing a resume does not invalidate an older resume already attached to an application. Avoid configuring a public bucket or sharing the service-role key.

### Email delivery

Configure `PUBLIC_APP_URL` as the public HTTPS origin, plus `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in the server
environment. These are required for email verification, password recovery, and
email OTP; application notifications and job alerts also use SMTP. Set
`GOOGLE_OAUTH_CLIENT_ID` and authorize the production site's origin in Google
Cloud to enable Google sign-in. Never put SMTP credentials in browser code or
commit them. Job alerts are sent when an
administrator publishes a job matching a candidate's target role and selected
employment/workplace, location, and salary preferences. Notification emails
are written to a deduplicated database outbox and delivered asynchronously;
transient failures retry up to five times with exponential backoff. Successful
delivery payloads are cleared from the outbox. Failed entries retain the
address/body needed for manual retry for up to 30 days after the final failed
attempt; after that, recipient, message, and error details are purged and the
delivery cannot be retried. Failed entries are visible only as non-content
metadata in the admin queue. Push delivery is not configured because no push
provider has been selected.

## Frontend and GitHub

The homepage and admin UI are plain static files in `public/` and are served
by the NestJS app from the same origin as the API. Commit the `public/` folder
with the backend; these pages rely on the running `/api` service and are not a
standalone GitHub Pages site. `.env` files and local database files under
`data/` are ignored by Git; commit `.env.example` as the safe configuration
template instead.

The public SPA uses hash routes for job search and details, sign-in and
registration, and candidate/employer workspaces. Its Careers, How it works,
For employers, About, Help, Privacy, and Terms pages are standalone routes,
not links to sections on the homepage. Privacy and Terms currently provide
high-level information and should be reviewed against the business's actual
policies before being treated as authoritative legal notices.

## Project layout

```text
public/index.html       Supplied esllp homepage
public/admin/index.html Admin dashboard UI preview
src/
  admin/                Superadmin user and audit endpoints
  auth/                 Candidate registration, login, token rotation, and RBAC
  audit/                Admin action audit log
  database/             PostgreSQL connection and schema migrations
  jobs/                 Job entity, query service, and API controller
  app.module.ts         Static frontend and feature module wiring
  main.ts               NestJS application bootstrap
data/                   Local development data (ignored by Git)
```
