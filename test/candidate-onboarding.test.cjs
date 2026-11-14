const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidateProfileService,
} = require("../dist/users/candidate-profile.service.js");
const { User } = require("../dist/users/user.entity.js");
const {
  UpdateCandidateProfileDto,
} = require("../dist/users/dto/update-candidate-profile.dto.js");
const { plainToInstance } = require("class-transformer");
const { validate } = require("class-validator");

function createServiceFixture() {
  const account = {
    id: 8,
    isActive: true,
    displayName: "Candidate",
    phoneVerified: false,
    phoneE164: null,
  };
  const profile = {
    userId: 8,
    headline: "",
    location: "",
    phone: "",
    summary: "",
    skills: "[]",
    desiredJobTitles: [],
    employmentTypes: [],
    workplaceTypes: [],
    experience: [],
    education: [],
    certifications: [],
    salaryPreferences: {},
    profileVisibility: "private",
    publicProfileEnabled: false,
    allowRecruiterContact: false,
    allowRecruiterResumeAccess: false,
    premiumBoostUntil: null,
    resumeBuilder: {},
    links: { linkedin: "", portfolio: "", github: "" },
    photoPath: null,
    resumePath: null,
    resumeFileName: null,
    shareProfileOnApplication: false,
    applicationEmailUpdates: true,
    jobAlertEmails: false,
    onboardingStep: 1,
  };
  const userRepository = {
    findOneBy: async () => account,
    save: async (value) => value,
  };
  const profileRepository = {
    findOneBy: async () => profile,
    create: (value) => ({ ...value }),
    save: async (value) => Object.assign(profile, value),
  };
  const resumeVersionsRepository = { find: async () => [] };
  const audits = [];
  const service = new CandidateProfileService(
    {
      transaction: async (callback) =>
        callback({
          getRepository: (entity) =>
            entity === User ? userRepository : profileRepository,
        }),
    },
    { createSignedUrl: async () => "https://files.example.test/signed" },
    userRepository,
    profileRepository,
    resumeVersionsRepository,
    { record: async (event) => audits.push(event) },
    { assertTaxonomyValue: async () => {} },
  );
  return { service, profile, account, audits };
}

test("candidate onboarding progress is saved with profile updates and returned on reload", async () => {
  const { service, profile, audits } = createServiceFixture();
  const user = { id: 8 };

  const updated = await service.update(user, {
    displayName: "Candidate",
    headline: "Product designer",
    onboardingStep: 3,
  });
  assert.equal(profile.onboardingStep, 3);
  assert.equal(updated.onboardingStep, 3);
  assert.equal(audits[0].action, "candidate.profile_updated");
  assert.match(audits[0].details.fields, /onboardingStep/);

  const reloaded = await service.get(user);
  assert.equal(reloaded.onboardingStep, 3);
});

test("onboarding progress accepts only valid wizard positions", async () => {
  for (const onboardingStep of [1, 5]) {
    const errors = await validate(
      plainToInstance(UpdateCandidateProfileDto, {
        displayName: "Candidate",
        onboardingStep,
      }),
    );
    assert.equal(
      errors.some((error) => error.property === "onboardingStep"),
      false,
    );
  }
  for (const onboardingStep of [0, 6, 2.5, null, "2"]) {
    const errors = await validate(
      plainToInstance(UpdateCandidateProfileDto, {
        displayName: "Candidate",
        onboardingStep,
      }),
    );
    assert.equal(
      errors.some((error) => error.property === "onboardingStep"),
      true,
    );
  }
});

test("WhatsApp interview reminder opt-in requires a verified phone and is auditable", async () => {
  const { service, profile, account, audits } = createServiceFixture();
  await assert.rejects(
    () =>
      service.update(
        { id: 8 },
        { displayName: "Candidate", whatsappInterviewReminders: true },
      ),
    /Verify a mobile number/,
  );
  assert.equal(profile.whatsappInterviewReminders, undefined);

  account.phoneVerified = true;
  account.phoneE164 = "+15551234567";
  await service.update(
    { id: 8 },
    { displayName: "Candidate", whatsappInterviewReminders: true },
  );
  assert.equal(profile.whatsappInterviewReminders, true);
  assert.ok(profile.whatsappInterviewRemindersConsentedAt instanceof Date);
  assert.equal(
    audits[0].action,
    "candidate.whatsapp_interview_reminders_consent_changed",
  );
  assert.equal(audits[0].details.optedIn, true);
});
