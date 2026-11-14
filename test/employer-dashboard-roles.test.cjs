const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EmployersService } = require("../dist/employers/employers.service.js");

function createService(role) {
  let applicationQueries = 0;
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization: {
      id: 21,
      planKey: "growth",
      subscriptionStatus: "active",
    },
    membership: { role },
  });
  service.platformConfiguration = {
    get: async () => ({ employerApprovalRequired: false }),
  };
  service.jobs = {
    createQueryBuilder() {
      return {
        where() {
          return this;
        },
        getMany: async () => [{ id: 8, isActive: true }],
      };
    },
  };
  service.applications = {
    createQueryBuilder() {
      applicationQueries += 1;
      throw new Error("Billing roles must not query hiring pipeline data");
    },
  };
  service.limitsFor = async () => ({
    activeJobs: 25,
    seats: 10,
    resumeCredits: 1,
  });
  service.notifications = { countBy: async () => 0 };
  return {
    service,
    getApplicationQueryCount: () => applicationQueries,
  };
}

test("billing dashboard omits hiring pipeline metrics and application data", async () => {
  const { service, getApplicationQueryCount } = createService("billing");

  const dashboard = await service.getDashboard(
    { id: 7, employerApprovalStatus: "approved" },
    21,
  );

  assert.equal(getApplicationQueryCount(), 0);
  assert.equal(dashboard.metrics.totalApplicants, 0);
  assert.deepEqual(dashboard.metrics.pipeline, {});
  assert.deepEqual(dashboard.recentApplications, []);
});
