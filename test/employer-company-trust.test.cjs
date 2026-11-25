const assert = require("node:assert/strict");
const { test } = require("node:test");
const { BadRequestException } = require("@nestjs/common");
const {
  OrganizationMemberRole,
} = require("../dist/employers/organization-member.entity.js");
const { EmployersService } = require("../dist/employers/employers.service.js");

test("company profile rejects whitespace-only names after normalization", async () => {
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization: { id: 5, name: "Example Corp" },
    membership: { role: OrganizationMemberRole.OWNER },
  });
  service.requireRole = () => {};

  await assert.rejects(
    service.updateCompany({ id: 7 }, { name: "  " }),
    BadRequestException,
  );
});

test("company verification requests save evidence and audit the request", async () => {
  const organization = {
    id: 5,
    verificationStatus: "unsubmitted",
    verificationDetails: null,
    verificationNote: null,
    verificationRequestedAt: null,
    verifiedAt: null,
  };
  const audits = [];
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization,
    membership: { role: OrganizationMemberRole.OWNER },
  });
  service.requireRole = () => {};
  service.organizations = {
    save: async (value) => value,
  };
  service.auditService = {
    record: async (entry) => audits.push(entry),
  };

  const result = await service.requestCompanyVerification(
    { id: 7 },
    "Registered with the local corporate registry; public registry entry is available at https://registry.example/company/5.",
  );

  assert.equal(result.verificationStatus, "pending");
  assert.match(organization.verificationDetails, /registry\.example/);
  assert.ok(organization.verificationRequestedAt instanceof Date);
  assert.equal(audits[0].action, "employer.company_verification_requested");
});

test("ownership transfer changes both member roles atomically and is audited", async () => {
  const owner = {
    id: 1,
    userId: 7,
    organizationId: 5,
    role: OrganizationMemberRole.OWNER,
    status: "active",
  };
  const nextOwner = {
    id: 2,
    userId: 8,
    organizationId: 5,
    role: OrganizationMemberRole.ADMIN,
    status: "active",
  };
  const members = [owner, nextOwner];
  const audits = [];
  const service = Object.create(EmployersService.prototype);
  service.getContext = async () => ({
    organization: { id: 5 },
    membership: owner,
  });
  service.dataSource = {
    transaction: async (callback) =>
      callback({
        getRepository: (entity) =>
          entity.name === "EmployerOrganization"
            ? { findOne: async () => ({ id: 5 }) }
            : {
                findOne: async ({ where }) =>
                  members.find((member) => member.id === where.id) || null,
                save: async (member) => member,
              },
      }),
  };
  service.auditService = {
    record: async (entry) => audits.push(entry),
  };

  const result = await service.transferOrganizationOwnership(
    { id: 7 },
    nextOwner.id,
  );

  assert.equal(owner.role, OrganizationMemberRole.ADMIN);
  assert.equal(nextOwner.role, OrganizationMemberRole.OWNER);
  assert.equal(result.newOwnerMemberId, nextOwner.id);
  assert.equal(audits[0].action, "employer.organization_ownership_transferred");
});
