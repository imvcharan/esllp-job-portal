const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  AdminInsightsService,
} = require("../dist/admin/admin-insights.service.js");

function createService(...results) {
  const calls = [];
  let resultIndex = 0;
  const service = Object.create(AdminInsightsService.prototype);
  service.applicationStatuses = {
    createQueryBuilder: () => {
      const query = {
        innerJoin: (...args) => { calls.push(["innerJoin", ...args]); return query; },
        select: (...args) => { calls.push(["select", ...args]); return query; },
        addSelect: (...args) => { calls.push(["addSelect", ...args]); return query; },
        where: (...args) => { calls.push(["where", ...args]); return query; },
        andWhere: (...args) => { calls.push(["andWhere", ...args]); return query; },
        getRawOne: async () => results[resultIndex++],
      };
      return query;
    },
  };
  return { service, calls };
}

test("hiring metrics report average time to accepted offer without claiming a hire", async () => {
  const { service, calls } = createService(
    { acceptedOffers: "4", averageDaysToAcceptance: "12.75" },
    { hires: "2", averageDaysToHire: "26.5" },
  );

  assert.deepEqual(await service.hiringMetrics(), {
    acceptedOffers: 4,
    averageDaysToAcceptance: 12.75,
    hires: 2,
    averageDaysToHire: 26.5,
  });
  assert.ok(calls.some(([, expression]) =>
    String(expression).includes("history.toStatus = 'offer_accepted'")));
  assert.ok(calls.some(([, expression]) =>
    String(expression).includes("history.fromStatus = 'offer'")));
  assert.ok(calls.some(([, expression]) =>
    String(expression).includes("history.toStatus = 'hired'")));
  assert.ok(calls.some(([, expression]) =>
    String(expression).includes("history.fromStatus = 'offer_accepted'")));
});

test("hiring metrics return zeros when no offers have been accepted", async () => {
  const { service } = createService(null, null);

  assert.deepEqual(await service.hiringMetrics(), {
    acceptedOffers: 0,
    averageDaysToAcceptance: 0,
    hires: 0,
    averageDaysToHire: 0,
  });
});
