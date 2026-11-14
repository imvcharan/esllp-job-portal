const assert = require("node:assert/strict");
const { test } = require("node:test");
const { plainToInstance } = require("class-transformer");
const { validate } = require("class-validator");
const { EmployersService } = require("../dist/employers/employers.service.js");
const {
  AssignApplicationDto,
} = require("../dist/employers/dto/employer-workflow.dto.js");
const {
  OrganizationMemberRole,
} = require("../dist/employers/organization-member.entity.js");

function createService({ role = OrganizationMemberRole.RECRUITER, member }) {
  const application = {
    id: 20,
    assignedToUserId: null,
    assignedTo: null,
  };
  const audits = [];
  let membershipQuery;
  const queryCalls = [];
  const queryBuilder = {
    innerJoinAndSelect(...args) {
      queryCalls.push(["innerJoinAndSelect", ...args]);
      return this;
    },
    leftJoinAndSelect(...args) {
      queryCalls.push(["leftJoinAndSelect", ...args]);
      return this;
    },
    where(...args) {
      queryCalls.push(["where", ...args]);
      return this;
    },
    andWhere(...args) {
      queryCalls.push(["andWhere", ...args]);
      return this;
    },
    getOne: async () => application,
  };
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization: { id: 5 },
    membership: { role },
  });
  service.applications = {
    createQueryBuilder: () => queryBuilder,
    save: async (value) => value,
  };
  service.members = {
    findOne: async (query) => {
      membershipQuery = query;
      return member;
    },
  };
  service.auditService = {
    record: async (entry) => audits.push(entry),
  };
  return {
    service,
    application,
    audits,
    queryCalls,
    getMembershipQuery: () => membershipQuery,
  };
}

test("employer assigns an application to an active member of the same company", async () => {
  const member = {
    role: OrganizationMemberRole.HIRING_MANAGER,
    user: { id: 31, isActive: true, displayName: "Riley Recruiter" },
  };
  const setup = createService({ member });

  const result = await setup.service.assignApplication({ id: 7 }, 20, 31, 5);

  assert.deepEqual(result, {
    applicationId: 20,
    assigneeUserId: 31,
    assigneeName: "Riley Recruiter",
  });
  assert.equal(setup.application.assignedToUserId, 31);
  assert.deepEqual(setup.getMembershipQuery(), {
    where: {
      organizationId: 5,
      userId: 31,
      status: "active",
    },
    relations: { user: true },
  });
  assert.ok(
    setup.queryCalls.some(
      ([method, expression, parameters]) =>
        method === "andWhere" &&
        expression === "job.organizationId = :organizationId" &&
        parameters.organizationId === 5,
    ),
  );
  assert.equal(setup.audits[0].action, "employer.application_assigned");
  assert.equal(setup.audits[0].details.assigneeUserId, 31);
});

test("employer cannot assign an application to a member outside the company", async () => {
  const setup = createService({ member: null });

  await assert.rejects(
    () => setup.service.assignApplication({ id: 7 }, 20, 31, 5),
    /active hiring-team member/,
  );
  assert.equal(setup.application.assignedToUserId, null);
  assert.equal(setup.audits.length, 0);
});

test("application assignment DTO accepts an assignee ID or explicit unassignment", async () => {
  assert.deepEqual(
    await validate(
      plainToInstance(AssignApplicationDto, { assigneeUserId: 31 }),
    ),
    [],
  );
  assert.deepEqual(
    await validate(
      plainToInstance(AssignApplicationDto, { assigneeUserId: null }),
    ),
    [],
  );
  assert.notDeepEqual(
    await validate(plainToInstance(AssignApplicationDto, {})),
    [],
  );
});
