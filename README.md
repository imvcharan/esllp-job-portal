# esllp Job Portal

NestJS serves the homepage from `public/index.html`, the admin dashboard from `public/admin/index.html`, and exposes the job API at `/api/jobs`. TypeORM connects to MySQL using the `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` environment variables. The application runs pending schema migrations automatically at startup.

## Requirements

- Node.js 20 or newer
- npm

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

Candidate registration currently does not send verification email; email delivery, verification, password reset, and candidate profile completion need a configured mail service and are not implemented yet.

Admin API routes require a bearer access token. `ADMIN` and `SUPERADMIN` can manage job drafts; only `SUPERADMIN` can list users, change account roles/status, and read audit logs. A newly created job is a draft (`isActive: false`) until an authorized user publishes it. Public job search returns active listings only. Admin UI access is gated at the browser and all admin data routes are independently authorization-checked by the API.

- `/api/admin/jobs` — list, create, edit, and archive jobs
- `/api/admin/users` — paginated user list and superadmin-only role/status updates
- `/api/admin/audit-logs` — paginated superadmin audit log

## Backend implementation status

This is the security and job-management foundation, not yet a complete production job portal. The admin UI uses live data for jobs, superadmin-visible user accounts, and audit events; when a supported list is empty, it displays clearly labeled preview rows instead. Preview examples are read-only and never used as API data. Application, interview, and hiring analytics, employer organization/company management, candidate profiles/resumes, and application review are not backed by server modules yet. The related dashboard panels remain labeled preview content, and actions that would imply persistence are disabled until those APIs exist. Workspace settings currently persist only in the current browser.

Remaining core modules include employer organizations and membership, candidate profiles and secure resume storage, applications and employer review workflows, email verification/password recovery and notification delivery, moderation/reporting, and live analytics. Before production, configure HTTPS, establish MySQL backups/restore tests, and arrange security review and superadmin MFA.

Use HTTPS in production. The refresh cookie is marked Secure when `NODE_ENV=production`; production startup also refuses to run without a 32+ character `JWT_ACCESS_SECRET`.

Useful API routes:

- `GET /api/jobs` — list active jobs
- `GET /api/jobs?q=designer&location=Bengaluru` — filter active jobs
- `GET /api/jobs/:id` — get an active job

The public homepage fetches published jobs from `/api/jobs` and includes URL-addressable search results and job detail views. Search sends the role/skill/company and location terms to the existing API; work arrangement, employment type, experience, company, salary, freshness, sorting, and pagination are applied in the browser to the returned results. If an unfiltered request succeeds but the database has no published jobs, clearly labeled sample listings are shown as read-only previews. API errors are surfaced rather than silently presented as live data. Saved jobs currently persist only in the visitor's browser; applying is visibly unavailable until candidate profiles and application APIs are implemented.

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
