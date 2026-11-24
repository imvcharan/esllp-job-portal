const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Controller, Get, Module } = require("@nestjs/common");
const { NestFactory } = require("@nestjs/core");
const { API_VERSIONING_OPTIONS } = require("../dist/api-versioning.js");

class VersionProbeController {
  status() {
    return { status: "ok" };
  }
}

Controller("version-probe")(VersionProbeController);
Get()(
  VersionProbeController.prototype,
  "status",
  Object.getOwnPropertyDescriptor(VersionProbeController.prototype, "status"),
);

class VersionProbeModule {}
Module({ controllers: [VersionProbeController] })(VersionProbeModule);

test("API v1 routes work without breaking unversioned routes", async () => {
  const app = await NestFactory.create(VersionProbeModule, { logger: false });
  app.setGlobalPrefix("api");
  app.enableVersioning(API_VERSIONING_OPTIONS);
  await app.listen(0, "127.0.0.1");

  try {
    const address = app.getHttpServer().address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    for (const path of ["/api/version-probe", "/api/v1/version-probe"]) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
    }

    const unsupportedVersion = await fetch(`${baseUrl}/api/v2/version-probe`);
    assert.equal(unsupportedVersion.status, 404);
  } finally {
    await app.close();
  }
});
