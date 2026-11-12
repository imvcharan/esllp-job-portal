const assert = require("node:assert/strict");
const { test } = require("node:test");
const { BadRequestException, NotFoundException } = require("@nestjs/common");
const { EmployersService } = require("../dist/employers/employers.service.js");

function createService() {
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization: { id: 21 },
    membership: { role: "recruiter" },
  });
  service.requireRole = () => undefined;
  service.auditService = { record: async () => undefined };
  service.employerSavedSearches = {
    find: async (options) => {
      service.findOptions = options;
      return [];
    },
    create: (value) => value,
    save: async (value) => ({ id: 7, ...value }),
    delete: async (where) => {
      service.deleteWhere = where;
      return { affected: 1 };
    },
  };
  return service;
}

test("employer saved candidate searches are scoped to user and organization", async () => {
  const service = createService();
  const saved = await service.saveCandidateSearch(
    { id: 8 },
    { name: "  Data team  ", query: 'Python AND ("data engineer" OR analyst)' },
  );
  assert.deepEqual(saved, {
    id: 7,
    organizationId: 21,
    userId: 8,
    name: "Data team",
    query: 'Python AND ("data engineer" OR analyst)',
  });

  await service.listCandidateSearches({ id: 8 });
  assert.deepEqual(service.findOptions.where, {
    userId: 8,
    organizationId: 21,
  });
  await service.deleteCandidateSearch({ id: 8 }, 7);
  assert.deepEqual(service.deleteWhere, {
    id: 7,
    userId: 8,
    organizationId: 21,
  });
});

test("employer saved searches reject invalid queries and cannot delete another user's search", async () => {
  const service = createService();
  await assert.rejects(
    service.saveCandidateSearch(
      { id: 8 },
      { name: "Bad search", query: "Python OR" },
    ),
    BadRequestException,
  );

  service.employerSavedSearches.delete = async () => ({ affected: 0 });
  await assert.rejects(
    service.deleteCandidateSearch({ id: 8 }, 99),
    NotFoundException,
  );
});
