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
    findOneBy: async (where) => {
      if (service.savedSearch)
        return Object.entries(where).every(
          ([key, value]) => service.savedSearch[key] === value,
        )
          ? service.savedSearch
          : null;
      return { id: 7, ...where };
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
    {
      name: "  Data team  ",
      query: 'Python AND ("data engineer" OR analyst)',
      shareWithTeam: true,
    },
  );
  assert.deepEqual(saved, {
    id: 7,
    organizationId: 21,
    userId: 8,
    name: "Data team",
    query: 'Python AND ("data engineer" OR analyst)',
    isShared: true,
  });

  await service.listCandidateSearches({ id: 8 });
  assert.deepEqual(service.findOptions.where, [
    { userId: 8, organizationId: 21 },
    { isShared: true, organizationId: 21 },
  ]);
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

test("saved candidate searches can be edited only by their creator", async () => {
  const service = createService();
  service.savedSearch = {
    id: 7,
    organizationId: 21,
    userId: 8,
    name: "Data team",
    query: "Python",
    isShared: false,
  };
  const result = await service.updateCandidateSearch(
    { id: 8 },
    7,
    {
      name: "Backend team",
      query: "Python AND PostgreSQL",
      shareWithTeam: true,
    },
  );
  assert.equal(result.name, "Backend team");
  assert.equal(result.query, "Python AND PostgreSQL");
  assert.equal(result.isShared, true);

  await assert.rejects(
    service.updateCandidateSearch({ id: 9 }, 7, { name: "Other" }),
    NotFoundException,
  );
});
