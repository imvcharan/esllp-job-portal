const assert = require("node:assert/strict");
const net = require("node:net");
const { test } = require("node:test");
const {
  BadRequestException,
  ServiceUnavailableException,
} = require("@nestjs/common");
const {
  CandidateFileScanService,
} = require("../dist/users/candidate-file-scan.service.js");

async function withFakeClamav(response, callback) {
  const server = net.createServer((socket) => {
    let request = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      request = Buffer.concat([request, chunk]);
      if (!request.subarray(0, 9).equals(Buffer.from("INSTREAM\0"))) return;
      let offset = 9;
      while (offset + 4 <= request.length) {
        const length = request.readUInt32BE(offset);
        offset += 4;
        if (length === 0) {
          socket.end(response);
          return;
        }
        if (offset + length > request.length) return;
        offset += length;
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const previousHost = process.env.CLAMAV_HOST;
  const previousPort = process.env.CLAMAV_PORT;
  process.env.CLAMAV_HOST = "127.0.0.1";
  process.env.CLAMAV_PORT = String(server.address().port);
  try {
    await callback();
  } finally {
    if (previousHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = previousHost;
    if (previousPort === undefined) delete process.env.CLAMAV_PORT;
    else process.env.CLAMAV_PORT = previousPort;
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("candidate uploads pass only when ClamAV reports a clean stream", async () => {
  await withFakeClamav("stream: OK\0", async () => {
    await new CandidateFileScanService().scan(Buffer.from("safe fixture"));
  });
});

test("candidate uploads are rejected when ClamAV detects malware", async () => {
  await withFakeClamav("stream: Eicar-Test-Signature FOUND\0", async () => {
    await assert.rejects(
      new CandidateFileScanService().scan(Buffer.from("test fixture")),
      BadRequestException,
    );
  });
});

test("production uploads fail closed when ClamAV is not configured", async () => {
  const previousEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    host: process.env.CLAMAV_HOST,
  };
  process.env.NODE_ENV = "production";
  delete process.env.CLAMAV_HOST;
  try {
    await assert.rejects(
      new CandidateFileScanService().scan(Buffer.from("fixture")),
      ServiceUnavailableException,
    );
  } finally {
    if (previousEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment.nodeEnv;
    if (previousEnvironment.host === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = previousEnvironment.host;
  }
});
