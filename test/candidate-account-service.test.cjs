const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidateAccountService,
} = require("../dist/users/candidate-account.service.js");
const {
  CandidateDeletionRequestStatus,
} = require("../dist/users/candidate-deletion-request.entity.js");

function createService(overrides = {}) {
  const audits = [];
  let deletedAccount = false;
  let savedDeletionRequest = null;
  const repositories = {
    users: {
      findOne: async () => ({
        id: 2,
        email: "candidate@example.test",
        displayName: "Candidate",
      }),
      find: async () => [],
      delete: async () => {
        deletedAccount = true;
      },
    },
    profiles: {
      findOneBy: async () => ({
        headline: "Engineer",
        photoPath: "private/photos/2.webp",
        resumePath: "private/resumes/2.pdf",
        resumeFileName: "resume.pdf",
      }),
    },
    applications: {
      find: async () => [
        {
          id: 5,
          status: "submitted",
          coverLetter: "Interested",
          resumePath: "private/resumes/2.pdf",
          resumeFileName: "resume.pdf",
          profileShared: false,
          profileSnapshot: null,
          withdrawnAt: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
          job: {
            id: 7,
            title: "Engineer",
            company: "Example",
            location: "Pune",
          },
        },
      ],
    },
    applicationStatuses: {
      find: async () => [],
    },
    offers: {
      find: async () => [
        {
          applicationId: 5,
          termsSummary: "Offer summary",
          status: "pending",
          expiresAt: new Date("2030-01-01T00:00:00Z"),
        },
      ],
    },
    messages: {
      find: async () => [
        {
          applicationId: 5,
          message: "Thank you",
          sender: { displayName: "Candidate" },
        },
      ],
    },
    savedJobs: {
      find: async () => [],
    },
    savedSearches: {
      find: async () => [],
    },
    notifications: {
      find: async () => [],
    },
    deletionRequests: {
      find: async () => [],
      findOne: async () => null,
      create: (request) => ({ ...request }),
      save: async (request) => {
        savedDeletionRequest = Object.assign(request, { id: 13 });
        return savedDeletionRequest;
      },
    },
  };
  Object.assign(repositories, overrides);
  const service = new CandidateAccountService(
    repositories.users,
    repositories.profiles,
    repositories.applications,
    repositories.applicationStatuses,
    repositories.offers,
    repositories.messages,
    repositories.savedJobs,
    repositories.savedSearches,
    repositories.notifications,
    repositories.deletionRequests,
    { record: async (event) => audits.push(event) },
  );
  return {
    service,
    audits,
    repositories,
    get deletedAccount() {
      return deletedAccount;
    },
    get savedDeletionRequest() {
      return savedDeletionRequest;
    },
  };
}

test("candidate export includes their records without exposing storage object paths", async () => {
  const { service } = createService();
  const result = await service.exportCandidateData({ id: 2 });

  assert.equal(result.account.email, "candidate@example.test");
  assert.equal(result.profile.hasPhoto, true);
  assert.equal(result.profile.hasResume, true);
  assert.equal(result.profile.resumeFileName, "resume.pdf");
  assert.equal("photoPath" in result.profile, false);
  assert.equal("resumePath" in result.profile, false);
  assert.equal("resumePath" in result.applications[0], false);
  assert.equal(result.applications[0].job.title, "Engineer");
  assert.equal(result.applications[0].offer.termsSummary, "Offer summary");
  assert.equal(result.applications[0].messages[0].message, "Thank you");
});

test("candidate deletion request is recorded for review and does not delete the account", async () => {
  const accountService = createService();
  const { service, audits } = accountService;
  const result = await service.requestDeletion(
    { id: 2 },
    { details: "  Please review my request.  " },
  );

  assert.deepEqual(result, {
    id: 13,
    status: CandidateDeletionRequestStatus.OPEN,
  });
  assert.equal(audits[0].action, "candidate.deletion_requested");
  assert.equal(
    accountService.savedDeletionRequest.details,
    "Please review my request.",
  );
  assert.equal(accountService.deletedAccount, false);
});
