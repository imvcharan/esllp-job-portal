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

The admin dashboard includes live overview metrics, job management, candidate account records for superadmins, employer organizations, application analytics, recent platform activity, account security, superadmin user management, and audit history. Counts and tables use database records; empty datasets show empty states instead of example people or invented metrics. Candidate account details, role/status controls, account creation, recent platform activity, and the security audit log remain restricted to their assigned roles. Account-list failures and timeouts are displayed in the table with retry guidance instead of leaving the page in a permanent loading state.

The superadmin audit log records successful account, job, employer, candidate, and hiring-workflow changes plus login successes and failures. Records are append-only and include request IP address, user agent, and approximate city/region/country when a local MaxMind City database is configured. It supports search, action/country/date filters, pagination, and CSV export. It does not use browser GPS or send IP addresses to an external geolocation service.

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

- `POST /api/auth/register` — public candidate registration; requires an 8-character minimum password (maximum 72 UTF-8 bytes)
- `GET /api/auth/bootstrap-superadmin/status` and `POST /api/auth/bootstrap-superadmin` — one-time first-superadmin setup; checks the configured superadmin name, email, and password and is disabled after a superadmin exists
- `POST /api/auth/register/employer` — employer registration request with company name/website; email verification is required before login, and administrator approval is required before write access
- `POST /api/auth/login` — issues a short-lived bearer access token and an HttpOnly, SameSite=Strict refresh cookie
- `POST /api/auth/refresh` — rotates the refresh token and issues a new access token
- `POST /api/auth/logout` — revokes the refresh session
- `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` — request and consume one-time password-reset links
- `POST /api/auth/verify-email` and `POST /api/auth/resend-verification` — verify a new account or request another link
- `POST /api/auth/change-password` — change the signed-in user's password and revoke refresh sessions
- `GET /api/auth/me` — current user (bearer token required)
- `GET /api/candidate/profile` — read the authenticated candidate's profile
- `PUT /api/candidate/profile` — create/update the authenticated candidate's profile
- `GET /api/candidate/saved-jobs` — list jobs saved to the authenticated candidate's account
- `POST /api/candidate/saved-jobs/:jobId` — save a currently published job; safe to retry
- `DELETE /api/candidate/saved-jobs/:jobId` — remove a saved job
- `GET|POST /api/candidate/saved-searches` — list or save up to 25 searches, including supported job filters and optional instant email alerts
- `PATCH|DELETE /api/candidate/saved-searches/:id` — update an owned saved search/alert preference or remove it
- `GET /api/candidate/applications?page=1&limit=20` — paginated applications as `{ items, total, page, limit }`
- `GET /api/candidate/applications/:jobId` — read that candidate's application as `{ application: ... }`, or `{ application: null }`
- `POST /api/candidate/applications/:jobId` — submit an application with optional note, resume inclusion, and profile-sharing choices; safe to retry
- `POST /api/candidate/applications/records/:applicationId/withdraw` — withdraw an application that is still submitted
- `GET /api/candidate/notifications?page=1` and `PATCH /api/candidate/notifications/:notificationId/read` — review and mark interview notifications read

Candidate profile routes require a candidate access token; profile data and files are private by default. New registrations require email verification. Password reset, resend verification, and signed-in password change use one-time tokens or session revocation. Configure the SMTP variables below for these flows. The web client routes candidate/employer accounts to their role-specific workspace and admin/superadmin accounts to `/admin/`.

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
for their organization. Active-job and seat quotas are currently defined in
`PLAN_LIMITS` in `src/employers/employers.service.ts`: Free has 1 job/1 seat,
Starter has 3 jobs/3 seats, and Growth has 10 jobs/10 seats. Paid quotas apply
after Razorpay confirms subscription activation.

The hiring workflow includes paginated applicant search and filters, status
history, company-private notes and tags, candidate-consented profile/resume
access, and interview scheduling/cancellation. Company roles are owner, admin,
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
- `GET|POST /api/employer/jobs` and `PATCH /api/employer/jobs/:jobId` — list and manage company jobs
- `POST /api/employer/jobs/:jobId/publish` and `/close` — publish or close a company job
- `GET /api/employer/applications` — search/filter organization applicants
- `PATCH /api/employer/applications/:applicationId/status` — update candidate stage
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

### Razorpay configuration

Razorpay is optional for Free-plan use. To enable paid checkout:

1. Create monthly INR subscription plans in the Razorpay dashboard with amounts
   you have chosen for the business. No commercial price has been preselected
   by this project.
2. Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_PLAN_STARTER`, and `RAZORPAY_PLAN_GROWTH` in the server
   environment. Configure `EMPLOYER_STARTER_PRICE_INR` and
   `EMPLOYER_GROWTH_PRICE_INR` only as display values matching the plans;
   the API verifies these values match the monthly INR Razorpay plan amounts
   before creating a subscription.
3. Set `RAZORPAY_WEBHOOK_SECRET` and configure the Razorpay webhook URL as
   `https://<your-domain>/api/billing/razorpay/webhook`. Subscribe to the
   subscription activation, charge, resume, halt, cancel, and completion
   events. Webhook signatures are verified against the raw request body and
   event IDs are recorded transactionally for retry-safe processing.
4. Test checkout and webhook delivery in Razorpay test mode against staging
   before using live keys. Never put API secrets or webhook secrets in browser
   code or commit them.

The Starter/Growth plan quotas are application-defined and can be changed in
`PLAN_LIMITS`; commercial amounts are configured in Razorpay. Do not deploy
paid checkout until plan IDs, matching displayed prices, API keys, webhook
secret, and staging verification are complete.

## Backend implementation status

This is not yet a complete production job portal. The admin UI uses live data for job listings, organizations, aggregate application metrics, activity, superadmin-visible user accounts, and audit events. Job listings include optional application deadlines, opening counts, and salary currency/pay period; expired listings are hidden from public search and cannot accept applications. Candidate accounts have a private profile editor, interactive photo crop, private PDF resume storage, experience and education history, career preferences, professional links, saved jobs/searches, and application tracking. Candidates can independently choose to attach their current resume and share a profile snapshot on each application; they can withdraw applications while status remains `submitted`. Approved employers have organization-scoped job management, applicant workflows, bulk status updates, team access, notifications, and interview scheduling. Employers see profile details/resumes only when the candidate consented. Application status emails, interview notices, and matching job alerts use SMTP. Production database, SMTP, Supabase Storage, Razorpay, backups, and deployment still require configuration and staging verification.

Before production, configure HTTPS, establish PostgreSQL backups/restore tests, test SMTP delivery, apply migrations against a staging database, and arrange security review and superadmin MFA. Review the Privacy and Terms pages against the business's actual data-retention, deletion, cookie/analytics, and service terms; the current pages are only high-level summaries.

Use HTTPS in production. The refresh cookie is marked Secure when `NODE_ENV=production`; production startup also refuses to run without a 32+ character `JWT_ACCESS_SECRET`.

Useful API routes:

- `GET /api/jobs?page=1&limit=20` — paginated active jobs as `{ items, total, page, limit, companies }`
- `GET /api/jobs?q=designer&location=Bengaluru&page=1&limit=20` — search active jobs; workplace, employment type, experience, company, salary, freshness, and sorting filters are supported as query parameters
- `GET /api/jobs/:id` — get an active job
- `GET|PUT /api/candidate/profile` — read or update the signed-in candidate's private profile
- `POST|DELETE /api/candidate/profile/photo` — upload a cropped photo or remove it
- `POST|DELETE /api/candidate/profile/resume` — upload a PDF resume or remove it

The public homepage fetches published jobs from `/api/jobs` and includes URL-addressable search results and job detail views. Search, filters, sorting, and pagination are applied by the API, and clients receive bounded result pages. If an unfiltered request succeeds but the database has no published jobs, clearly labeled sample listings are shown as read-only previews. API errors are surfaced rather than silently presented as live data. Signed-in candidates save published jobs and searches to their account; guest and preview saves remain browser-local and are offered for sync at sign-in. Candidates choose whether to attach a resume or share a profile when applying, track the full status history, and withdraw applications that remain submitted; withdrawal is final and candidates cannot reapply to that job. Interview scheduling and cancellation appear in the candidate notification center. Employers review organization-owned job applications; status changes are audited in the application timeline and emailed when the candidate has enabled status notifications. Public share pages at `/share/jobs/:id` provide canonical metadata and `JobPosting` structured data; `/sitemap.xml` lists active job share pages and `/robots.txt` references the sitemap. Set `PUBLIC_APP_URL` to the site’s canonical absolute HTTP(S) origin for these endpoints and matching-job email links.

## Production build

```powershell
npm run build
npm run start:prod
```

Configure `DATABASE_URL` or `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DATABASE` using the connection details from the hosting provider. Set `POSTGRES_SSL=true` if the provider requires TLS. If the provider uses a private database CA, download its root certificate and set the complete PEM value as `POSTGRES_SSL_CA`; certificate verification remains enabled. Keep credentials in the hosting provider's environment settings and never commit them. `PORT` is supplied by the hosting provider when applicable. The initial schema migrations run automatically when the application starts. Existing MySQL or local SQLite data is not copied automatically; export and import any data you need into PostgreSQL separately.

### Private candidate file storage

Candidate photo and resume uploads require Supabase Storage in addition to the PostgreSQL database:

1. In Supabase Storage, create a bucket named `candidate-private` and keep it **private**. Do not add public read policies.
2. Set the bucket file-size limit to at least 8 MB and allow only `image/webp` and `application/pdf`.
3. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the server's environment. Use a newly generated, server-only service-role secret; never put it in `public/`, a browser variable, or committed files. `SUPABASE_CANDIDATE_BUCKET` is optional and defaults to `candidate-private`.
4. Deploy the application. Photos are decoded, normalized and resized by the API; resumes are limited to PDF files up to 8 MB. Stored files use owner-scoped object paths in the private bucket. The API returns signed links that expire after five minutes.

The profile/photo and profile/resume upload and delete endpoints require an authenticated candidate account. A resume is **not** automatically attached to an application; candidates choose whether to include it for each submission. Employer access is restricted to assigned jobs, and signed resume URLs are issued only for resumes deliberately attached to those applications. Replacing/removing a resume does not invalidate an older resume already attached to an application. Avoid configuring a public bucket or sharing the service-role key.

### Email delivery

Configure `PUBLIC_APP_URL` as the public HTTPS origin, plus `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in the server
environment. These are required for email verification and password recovery;
application notifications and job alerts also use SMTP. Never put SMTP
credentials in browser code or commit them. Job alerts are sent when an
administrator publishes a job matching a candidate's target role and selected
employment/workplace preferences. Failed alert deliveries are logged and
reported in the admin response; there is no automatic retry queue.

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
