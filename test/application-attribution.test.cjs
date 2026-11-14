const assert = require("node:assert/strict");
const { test } = require("node:test");
const { plainToInstance } = require("class-transformer");
const { validate } = require("class-validator");
const {
  normalizeApplicationSourceAttribution,
} = require("../dist/users/application-attribution.js");
const {
  ApplicationSourceAttributionDto,
  SubmitCandidateApplicationDto,
} = require("../dist/users/dto/submit-candidate-application.dto.js");

test("application attribution is normalized and bounded", () => {
  assert.deepEqual(
    normalizeApplicationSourceAttribution({
      source: " LinkedIn ",
      medium: "Paid Social",
      campaign: `Launch ${"x".repeat(90)}`,
    }),
    {
      source: "linkedin",
      medium: "paid-social",
      campaign: `launch-${"x".repeat(57)}`,
    },
  );
  assert.equal(
    normalizeApplicationSourceAttribution({
      source: " ",
      medium: "",
      campaign: "",
    }),
    null,
  );
});

test("application attribution accepts bounded labels and rejects URLs or personal text", async () => {
  const valid = plainToInstance(SubmitCandidateApplicationDto, {
    sourceAttribution: plainToInstance(ApplicationSourceAttributionDto, {
      source: "job-board",
      medium: "referral",
      campaign: "spring-launch",
    }),
  });
  assert.deepEqual(await validate(valid), []);

  const invalid = plainToInstance(SubmitCandidateApplicationDto, {
    sourceAttribution: plainToInstance(ApplicationSourceAttributionDto, {
      source: "https://example.com/?email=person@example.com",
    }),
  });
  assert.notDeepEqual(await validate(invalid), []);
});
