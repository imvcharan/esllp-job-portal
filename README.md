# esllp Job Portal

NestJS serves the homepage from `public/index.html`, the admin dashboard from `public/admin/index.html`, and exposes the job API at `/api/jobs`. TypeORM connects to MySQL using the `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` environment variables. The application runs pending schema migrations automatically at startup.

## Requirements

- Node.js 20 or newer
- npm

## Local XAMPP database (Windows)

Start MySQL from the XAMPP Control Panel before running the application.
Apache is optional: NestJS serves the website and API itself, so opening the
site through Apache/phpMyAdmin is not the application URL.

The local development database is `esllp_job_portal`, using `utf8mb4`. The
application connects as the dedicated `esllp_app` account, which is granted
access only to that database; it does not connect as MySQL root. Local database
credentials and a random development JWT secret belong in the Git-ignored
`.env` file, never in committed source. Configure:

```dotenv
PORT=3000
NODE_ENV=development
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=esllp_app
MYSQL_PASSWORD=<locally generated database-user password>
MYSQL_DATABASE=esllp_job_portal
JWT_ACCESS_SECRET=<unique random secret of at least 32 characters>
```

On this development machine port `3000` is used by another local service; its
`.env` therefore sets `PORT=3001`. Keep the port free on your machine and use
the value configured in `.env`. Never copy the generated local `.env` into
source control or production.

Create the database and restricted app user once in XAMPP's MySQL/MariaDB
server (for example, using phpMyAdmin's SQL tab while signed in as a database
administrator):

```sql
CREATE DATABASE esllp_job_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
CREATE USER 'esllp_app'@'127.0.0.1' IDENTIFIED BY '<unique random password>';
GRANT ALL PRIVILEGES ON esllp_job_portal.* TO 'esllp_app'@'127.0.0.1';
```

Put the same generated database-user password in `.env`. Then run migrations
and start the local app:

```powershell
npm run migration:run
npm run build
npm run bootstrap:superadmin
npm run start:dev
```

The local setup creates the initial superadmin as `admin@esllp.local`. Its
random one-time password is stored in the ignored `.env` as
`SUPERADMIN_PASSWORD`; do not share or commit that file. The bootstrap command
refuses to promote an existing account or create another superadmin.

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

The admin dashboard includes overview, jobs, candidate accounts/pipeline, companies, analytics, settings, superadmin user management, and audit history. Jobs are loaded from the protected API; an empty jobs table gets clearly marked, read-only sample listings. Superadmins can page/search/filter accounts, change roles and account status, and inspect the audit trail. Empty users/audit pages show explicitly labeled, non-editable examples. Browser search, job filters, settings preferences (saved in that browser only), and CSV exports are available.

## Authentication and superadmin

Copy `.env.example` to `.env`, configure the MySQL connection values, set a unique `JWT_ACCESS_SECRET` (at least 32 characters), and configure the superadmin name, email, and a unique password (16–72 UTF-8 bytes). `.env` is ignored by Git and must not be committed.

After building, create the first superadmin once:

```powershell
npm run build
npm run bootstrap:superadmin
```

The command runs pending migrations and creates the superadmin only if no account already uses that email and no superadmin exists. It never promotes an existing account or resets credentials. The password is stored as a bcrypt hash. Do not use the example values in production.

Authentication routes:

- `POST /api/auth/register` — public candidate registration; requires a 12–72 UTF-8 byte password
- `POST /api/auth/login` — issues a short-lived bearer access token and an HttpOnly, SameSite=Strict refresh cookie
- `POST /api/auth/refresh` — rotates the refresh token and issues a new access token
- `POST /api/auth/logout` — revokes the refresh session
- `GET /api/auth/me` — current user (bearer token required)
- `GET /api/candidate/profile` — read the authenticated candidate's profile
- `PUT /api/candidate/profile` — create/update the authenticated candidate's profile
- `GET /api/candidate/saved-jobs` — list jobs saved to the authenticated candidate's account
- `POST /api/candidate/saved-jobs/:jobId` — save a currently published job; safe to retry
- `DELETE /api/candidate/saved-jobs/:jobId` — remove a saved job
- `GET /api/candidate/applications` — list the authenticated candidate's applications
- `GET /api/candidate/applications/:jobId` — read that candidate's application as `{ application: ... }`, or `{ application: null }`
- `POST /api/candidate/applications/:jobId` — submit an application with an optional short note; safe to retry

Candidate profile read/update currently supports display name, headline,
location, optional phone, summary, and skills. Profile routes require a
candidate access token; profile data is private by default. Experience,
education, preferences, resume upload, employer visibility/sharing, and
profile completeness are not implemented yet. The web client routes
candidate/employer accounts to their role-specific workspace and admin/
superadmin accounts to `/admin/`; this has been verified against local test
accounts. Registration does not send verification email; email delivery,
verification, and password recovery are not implemented yet. There is no
forgot-password link or screen because the server has no password-reset flow.

Admin API routes require a bearer access token. `ADMIN` and `SUPERADMIN` can manage job drafts; only `SUPERADMIN` can list users, change account roles/status, and read audit logs. A newly created job is a draft (`isActive: false`) until an authorized user publishes it. Public job search returns active listings only. Admin UI access is gated at the browser and all admin data routes are independently authorization-checked by the API.

- `/api/admin/jobs` — list, create, edit, and archive jobs
- `/api/admin/users` — paginated user list and superadmin-only role/status updates
- `/api/admin/audit-logs` — paginated superadmin audit log

## Backend implementation status

This is the security and job-management foundation, not yet a complete production job portal. The admin UI uses live data for jobs, superadmin-visible user accounts, and audit events; when a supported list is empty, it displays clearly labeled preview rows instead. Preview examples are read-only and never used as API data. Candidate accounts have a responsive workspace with a saved profile editor, published-job search and details, account-synced saved jobs, and application submission/history. Guest and preview saves remain browser-local. Candidate application notes are optional, application creation is idempotent per candidate/job pair, and the current status is limited to `submitted`; resume uploads, withdrawal, employer review/status changes, and application notifications are not implemented. Employer accounts have a responsive workspace shell, but organization setup, employer-owned job management, team access, and applicant review are not implemented. Candidate experience/education, resume storage, interview and hiring analytics, notifications, and moderation are also not yet backed by server modules. Workspace settings currently persist only in the current browser.

Remaining core modules include employer organizations and membership, candidate experience/education and secure resume storage, the employer application review and status lifecycle, email verification/password recovery and notification delivery, moderation/reporting, and live analytics. Before production, configure HTTPS, establish MySQL backups/restore tests, and arrange security review and superadmin MFA.

Use HTTPS in production. The refresh cookie is marked Secure when `NODE_ENV=production`; production startup also refuses to run without a 32+ character `JWT_ACCESS_SECRET`.

Useful API routes:

- `GET /api/jobs` — list active jobs
- `GET /api/jobs?q=designer&location=Bengaluru` — filter active jobs
- `GET /api/jobs/:id` — get an active job

The public homepage fetches published jobs from `/api/jobs` and includes URL-addressable search results and job detail views. Search sends the role/skill/company and location terms to the existing API; work arrangement, employment type, experience, company, salary, freshness, sorting, and pagination are applied in the browser to the returned results. If an unfiltered request succeeds but the database has no published jobs, clearly labeled sample listings are shown as read-only previews. API errors are surfaced rather than silently presented as live data. Signed-in candidates save published jobs to their account; guest and preview saves remain browser-local and are offered for sync at sign-in. Candidates submit applications from their workspace and can review submitted status; employer review, resume attachments, withdrawal, and notifications remain unavailable.

## Production build

```powershell
npm run build
npm run start:prod
```

Configure `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` using the connection details from the hosting provider. Keep credentials in the hosting provider's environment settings and never commit them. `PORT` is supplied by the hosting provider when applicable. The initial schema migrations run automatically when the application starts. The local SQLite database is not uploaded or migrated automatically; import any needed existing data into MySQL separately.

## Project layout

```text
public/index.html       Supplied esllp homepage
public/admin/index.html Admin dashboard UI preview
src/
  admin/                Superadmin user and audit endpoints
  auth/                 Candidate registration, login, token rotation, and RBAC
  audit/                Admin action audit log
  database/             MySQL connection and schema migrations
  jobs/                 Job entity, query service, and API controller
  app.module.ts         Static frontend and feature module wiring
  main.ts               NestJS application bootstrap
data/                   Local development data (ignored by Git)
```
