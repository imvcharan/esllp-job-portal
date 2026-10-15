# esllp Frontend Roadmap

This file tracks the remaining public-facing frontend work for the esllp job
portal. It is a product implementation checklist, not a claim that the
listed screens or backend capabilities already exist.

## Completed first slice

- The public homepage loads published jobs from `GET /api/jobs`.
- Search results and job details are addressable by URL hash and support browser
  back/forward navigation.
- Search uses the existing role/company/description and location query API.
- Results include browser-side work arrangement, employment type, experience,
  company, salary, and posting-freshness filters, sorting, and pagination.
- An empty unfiltered live response may show clearly labeled, read-only sample
  roles. Search/API errors are shown as errors and are not replaced by samples.
- Job detail safely displays listing text, shows the provided salary range, and
  explains that applications are not available yet.
- Saved jobs persist in the current browser only; account synchronization is
  not implemented.
- Fabricated company names, role counts, and match percentages were removed or
  relabeled as illustrative content.

## Remaining implementation slices

### 1. Candidate access and account screens

- [ ] Build candidate sign-up and sign-in pages using the existing auth routes.
- [ ] Provide validation, pending, success, and actionable error states.
- [ ] Add password visibility controls, password recovery entry point, and
      session-expired handling.
- [ ] Keep access tokens and refresh/session behavior aligned with the existing
      secure backend contract; do not store credentials in browser storage.
- [ ] Add logout and an authenticated candidate navigation/header.

**Backend coordination:** registration and login APIs exist. Password recovery,
email verification, and profile APIs are not implemented; show those features
as unavailable until their endpoints are ready.

### 2. Candidate onboarding and profile

- [ ] Create a guided, save-and-resume onboarding flow.
- [ ] Capture contact details, location, headline, summary, experience,
      education, skills, preferred roles, salary expectations, and work
      arrangement.
- [ ] Add profile completeness guidance based only on actual saved fields.
- [ ] Support profile preview and editing.
- [ ] Add visibility and privacy controls, with clear explanations of what
      employers can see.
- [ ] Add resume upload, replacement, download, and removal states, including
      file type/size validation and upload progress.

**Backend coordination:** candidate profile persistence, resume storage,
validation limits, and privacy/visibility APIs are required.

### 3. Saved jobs and applications

- [ ] Replace the current browser-only saved-job experience with an account
      saved-jobs page and server synchronization; retain an honest local-only
      notice before sync is supported.
- [ ] Add an application form with profile/resume selection, employer
      questions, review, confirmation, and duplicate-application handling.
- [ ] Support quick apply only when the candidate has the required profile
      information.
- [ ] Build an application history page with status, dates, job links, and
      clear empty/loading/error states.
- [ ] Add withdrawal behavior only if the server supports it and confirms the
      resulting state.
- [ ] Provide notification preferences and application updates.

**Backend coordination:** saved-job, application, employer-review, and
notification APIs are required. Never display a success confirmation unless
the server confirms the action.

### 4. Employer onboarding and company profiles

- [ ] Add employer registration/access and organization onboarding.
- [ ] Create company profile setup and public company pages with verified,
      clearly sourced information.
- [ ] Add organization membership, invitations, and role/permission screens.
- [ ] Provide employer account, company verification, and moderation states.

**Backend coordination:** employer organizations, memberships, company
profiles, verification, and employer authorization are not implemented.

### 5. Employer job posting and job management

- [ ] Build a guided job-posting form with title, description, responsibilities,
      qualifications, location, work arrangement, employment type, experience,
      salary range/currency/pay period, and application questions.
- [ ] Add field-level validation, draft save, preview, publish confirmation,
      edit, pause, close, and expiry states.
- [ ] Clearly distinguish saved drafts from published jobs.
- [ ] Add a company job list with status, search/filter, and empty/error states.
- [ ] Ensure public job detail and search reflect the employer's confirmed
      publication status.

**Backend coordination:** the current admin API supports a narrower job schema
and admin job operations. Employer-owned posting, richer job fields, expiry,
and a complete archive/close lifecycle need backend support and authorization.

### 6. Applicant management and hiring workflow

- [ ] Build an employer applicant inbox with search, filters, and job context.
- [ ] Add candidate/application detail with resume access controlled by
      authorization.
- [ ] Add stages, notes, shortlist/reject actions, and stage history.
- [ ] Add interview scheduling, candidate communications, and clear delivery
      status.
- [ ] Provide accessible empty, loading, error, and confirmation states for
      every workflow.

**Backend coordination:** application review, stage transitions, notes,
interviews, resume authorization, and messaging APIs are required.

### 7. Trust, support, and public content

- [ ] Add real About, Help/Support, Privacy, Terms, and employer contact
      destinations; remove dead fragment links.
- [ ] Add a report-job flow and moderation feedback.
- [ ] Show company verification and job freshness only when supported by
      trustworthy source data.
- [ ] Make salary provenance and compensation periods clear; never imply a
      salary is guaranteed when it is an employer-provided range.
- [ ] Keep all preview/sample listings unmistakably labeled and non-actionable.
- [ ] Add real social links only after the official destinations are confirmed.

### 8. Quality, accessibility, and discoverability

- [ ] Audit responsive behavior for small phones, tablets, and wide displays.
- [ ] Ensure keyboard navigation, visible focus, semantic headings, labels,
      screen-reader announcements, and dialog focus management.
- [ ] Verify readable type sizes, contrast, reduced-motion behavior, and
      touch target sizing.
- [ ] Standardize loading skeletons, empty states, errors, retry actions,
      success feedback, and offline/network messaging.
- [ ] Add page-specific titles, descriptions, canonical URLs, share metadata,
      and search-engine-friendly job detail URLs/structured data.
- [ ] Optimize images/fonts and prevent layout shifts; test browser performance.
- [ ] Test frontend routes and interactions on desktop and mobile, including
      back/forward navigation and direct links to search/job details.

## Suggested delivery order

1. Candidate access screens.
2. Candidate onboarding, profile, and resume.
3. Account-synced saved jobs and the application journey.
4. Employer onboarding and company profiles.
5. Employer job posting and job management.
6. Applicant management and hiring workflow.
7. Trust/support content and legal destinations.
8. Full accessibility, responsive, SEO, and performance pass.

Implement each slice against confirmed API contracts. Where a required backend
feature is missing, keep the frontend state informative and non-persistent
rather than presenting a simulated action as completed.
