import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Response } from "express";
import { Repository } from "typeorm";
import { EmployerOrganization } from "./organization.entity";
import {
  EmployerOrganizationMember,
  OrganizationMemberRole,
} from "./organization-member.entity";
import { Job } from "../jobs/job.entity";
import { EmployerApprovalStatus } from "../users/user.entity";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

@Controller("companies")
export class PublicCompanyPagesController {
  constructor(
    @InjectRepository(EmployerOrganization)
    private readonly organizations: Repository<EmployerOrganization>,
    @InjectRepository(EmployerOrganizationMember)
    private readonly members: Repository<EmployerOrganizationMember>,
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
  ) {}

  @Get(":slug")
  async bySlug(@Param("slug") slug: string, @Res() response: Response) {
    const organization = await this.organizations.findOneBy({ slug });
    if (!organization) throw new NotFoundException("Company page was not found.");
    return this.render(organization, response);
  }

  @Get("id/:id")
  async byId(
    @Param("id", ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    const organization = await this.organizations.findOneBy({ id });
    if (!organization) throw new NotFoundException("Company page was not found.");
    return this.render(organization, response);
  }

  private async render(
    organization: EmployerOrganization,
    response: Response,
  ): Promise<void> {
    const [owners, jobs] = await Promise.all([
      this.members.find({
        where: {
          organizationId: organization.id,
          role: OrganizationMemberRole.OWNER,
          status: "active",
        },
        relations: { user: true },
      }),
      this.jobs
        .createQueryBuilder("job")
        .where("job.organizationId = :organizationId", {
          organizationId: organization.id,
        })
        .andWhere("job.isActive = true")
        .andWhere(
          "(job.applicationDeadline IS NULL OR job.applicationDeadline >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)",
        )
        .orderBy("job.createdAt", "DESC")
        .take(100)
        .getMany(),
    ]);
    const approvedOwner = owners.some(
      (member) =>
        member.user?.isActive &&
        member.user.emailVerified &&
        member.user.employerApprovalStatus === EmployerApprovalStatus.APPROVED,
    );
    const origin = process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? "";
    const canonical = `${origin}/companies/${encodeURIComponent(organization.slug)}`;
    const title = `${organization.name} · Company and open jobs`;
    const description =
      organization.description?.trim() ||
      `Explore current job openings at ${organization.name}.`;
    const structuredData = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: organization.name,
      url: organization.website ?? canonical,
      description,
    }).replace(/</g, "\\u003c");
    const jobCards = jobs.length
      ? jobs
          .map(
            (job) => `<article class="job"><h2><a href="/#job/${job.id}">${escapeHtml(job.title)}</a></h2><p>${escapeHtml(job.location)} · ${escapeHtml(job.workplaceType)} · ${escapeHtml(job.employmentType)}</p>${job.description ? `<p>${escapeHtml(job.description.slice(0, 800))}</p>` : ""}</article>`,
          )
          .join("")
      : "<p>There are no current public openings at this company.</p>";
    response
      .type("html")
      .set("Cache-Control", "public, max-age=120, stale-while-revalidate=300")
      .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description.slice(0, 300))}"><link rel="canonical" href="${escapeHtml(canonical)}"><script type="application/ld+json">${structuredData}</script><style>body{margin:0;padding:24px;font:16px/1.6 system-ui,sans-serif;color:#18322b;background:#f7f8f5}main{max-width:900px;margin:6vh auto;padding:32px;border:1px solid #e1e8e1;border-radius:16px;background:white}h1{line-height:1.2}.muted{color:#52645c}.job{padding:18px 0;border-top:1px solid #e1e8e1}.job a{color:#183d32}.badge{display:inline-block;padding:3px 10px;border-radius:99px;background:#edf5ee}</style></head>
<body><main><p><a href="/">esllp · Jobs</a></p><h1>${escapeHtml(organization.name)}</h1>${approvedOwner ? '<p class="badge">Employer account approved</p><p class="muted">Approval status is based on the employer account review recorded by the platform; it does not certify company claims.</p>' : '<p class="muted">Employer account approval is not currently confirmed.</p>'}<p>${escapeHtml(description)}</p>${organization.industry ? `<p><strong>Industry:</strong> ${escapeHtml(organization.industry)}</p>` : ""}${organization.companySize ? `<p><strong>Company size:</strong> ${escapeHtml(organization.companySize)}</p>` : ""}${organization.website ? `<p><a href="${escapeHtml(organization.website)}" rel="noopener noreferrer nofollow">${escapeHtml(organization.website)}</a></p>` : ""}<h2>Open jobs</h2>${jobCards}</main></body></html>`);
  }
}
