const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  InternalServerErrorException,
  ServiceUnavailableException,
} = require("@nestjs/common");
const {
  CandidateFileStorageService,
} = require("../dist/users/candidate-file-storage.service.js");

async function withStorageEnvironment(callback) {
  const previous = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_CANDIDATE_BUCKET,
    fetch: global.fetch,
  };
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
  process.env.SUPABASE_CANDIDATE_BUCKET = "candidate-private";
  try {
    await callback();
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined)
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    if (previous.bucket === undefined)
      delete process.env.SUPABASE_CANDIDATE_BUCKET;
    else process.env.SUPABASE_CANDIDATE_BUCKET = previous.bucket;
    global.fetch = previous.fetch;
  }
}

function createStorage(status = "clean") {
  return new CandidateFileStorageService({
    query: async () => (status ? [{ status }] : []),
  });
}

test("private signed links require a clean scan and validate the provider URL", async () => {
  await withStorageEnvironment(async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          signedURL:
            "/object/sign/candidate-private/42/resume/current.pdf?token=short-lived",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const url = await createStorage().createSignedUrl("42/resume/current.pdf");
    assert.equal(
      url,
      "https://project.supabase.co/storage/v1/object/sign/candidate-private/42/resume/current.pdf?token=short-lived",
    );

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          signedURL:
            "https://attacker.example/storage/v1/object/sign/candidate-private/42/resume/current.pdf?token=stolen",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    await assert.rejects(
      createStorage().createSignedUrl("42/resume/current.pdf"),
      InternalServerErrorException,
    );
  });
});

test("pending and unknown scan states never produce a signed file link", async () => {
  await withStorageEnvironment(async () => {
    let signedLinkRequested = false;
    global.fetch = async () => {
      signedLinkRequested = true;
      return new Response("{}", { status: 200 });
    };
    for (const scanStatus of ["pending", null]) {
      await assert.rejects(
        createStorage(scanStatus).createSignedUrl("42/resume/current.pdf"),
        ServiceUnavailableException,
      );
    }
    assert.equal(signedLinkRequested, false);
  });
});
