const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CandidateProfileService,
} = require("../dist/users/candidate-profile.service.js");
const {
  extractResumeSuggestions,
} = require("../dist/users/resume-suggestions.js");

test("resume parser returns section-based, reviewable profile suggestions", () => {
  const suggestions = extractResumeSuggestions(`SKILLS
TypeScript, PostgreSQL, React, TypeScript

PROFESSIONAL EXPERIENCE
Senior Engineer | Example Co
Jan 2021 – Present

EDUCATION
B.Tech in Computer Science, Demo University
Aug 2017 - May 2021`);

  assert.deepEqual(suggestions, {
    skills: ["TypeScript", "PostgreSQL", "React"],
    experience: [
      {
        title: "Senior Engineer",
        company: "Example Co",
        period: "Jan 2021 – Present",
        startDate: "2021-01",
        endDate: "",
        current: true,
      },
    ],
    education: [
      {
        qualification: "B.Tech in Computer Science",
        institution: "Demo University",
        period: "Aug 2017 - May 2021",
        startDate: "2017-08",
        endDate: "2021-05",
      },
    ],
  });
});

test("candidate profile response avoids returning parsed text for every resume version", async () => {
  const parsedText = `SKILLS
TypeScript, PostgreSQL`;
  const profile = {
    userId: 42,
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
    resumePath: "private/resumes/current.pdf",
    resumeFileName: "current.pdf",
    shareProfileOnApplication: false,
    applicationEmailUpdates: true,
    jobAlertEmails: false,
    onboardingStep: 1,
  };
  const currentVersion = {
    id: 2,
    userId: 42,
    storagePath: profile.resumePath,
    fileName: "current.pdf",
    mimeType: "application/pdf",
    parsedText,
    createdAt: new Date("2026-11-01T00:00:00Z"),
  };
  let versionQuery;
  const service = new CandidateProfileService(
    {},
    { createSignedUrl: async (path) => `https://files.example.test/${path}` },
    {
      findOneBy: async () => ({
        id: 42,
        isActive: true,
        email: "candidate@example.test",
        displayName: "Candidate",
        username: "candidate",
        phoneE164: "",
        pendingPhoneE164: null,
        phoneVerified: false,
      }),
    },
    { findOneBy: async () => profile },
    {
      find: async (query) => {
        versionQuery = query;
        return [
          {
            id: 2,
            userId: 42,
            storagePath: profile.resumePath,
            fileName: "current.pdf",
            mimeType: "application/pdf",
            createdAt: currentVersion.createdAt,
          },
        ];
      },
      findOneBy: async () => currentVersion,
    },
    {},
    {},
  );

  const result = await service.get({ id: 42 });
  assert.equal(result.parsedResumeText, parsedText);
  assert.deepEqual(result.resumeSuggestions.skills, [
    "TypeScript",
    "PostgreSQL",
  ]);
  assert.equal(Object.hasOwn(result.resumeVersions[0], "parsedText"), false);
  assert.equal(Object.hasOwn(versionQuery.select, "parsedText"), false);
});
