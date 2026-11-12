import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Response } from "express";
import { Repository } from "typeorm";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";
import { EmployerOrganization } from "../employers/organization.entity";
import { CandidateProfile } from "./candidate-profile.entity";
import { User, UserRole } from "./user.entity";

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

@Controller("u")
export class PublicUserProfileController {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(CandidateProfile)
    private readonly profiles: Repository<CandidateProfile>,
    @InjectRepository(EmployerOrganizationMember)
    private readonly members: Repository<EmployerOrganizationMember>,
  ) {}

  @Get(":username")
  async byUsername(
    @Param("username") username: string,
    @Res() response: Response,
  ): Promise<void> {
    const user = await this.users.findOneBy({
      username: username.trim().toLowerCase(),
      isActive: true,
    });
    if (!user) throw new NotFoundException("Public profile was not found.");

    if (user.role === UserRole.EMPLOYER) {
      const owner = await this.members.findOne({
        where: {
          userId: user.id,
          status: "active",
        },
        relations: { organization: true },
      });
      if (owner?.organization) {
        response.redirect(
          302,
          `/companies/${encodeURIComponent(owner.organization.slug)}`,
        );
        return;
      }
      throw new NotFoundException("Public profile was not found.");
    }

    if (user.role !== UserRole.CANDIDATE) {
      throw new NotFoundException("Public profile was not found.");
    }
    const profile = await this.profiles.findOneBy({ userId: user.id });
    if (!profile?.publicProfileEnabled) {
      throw new NotFoundException("Public profile was not found.");
    }

    const origin = process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? "";
    const canonical = `${origin}/u/${encodeURIComponent(user.username!)}`;
    const title = `${user.displayName} · Candidate profile`;
    const description =
      profile.summary.trim() ||
      profile.headline.trim() ||
      `Explore ${user.displayName}'s public candidate profile.`;
    const skills = this.parseSkills(profile.skills);
    const content = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Person",
      name: user.displayName,
      url: canonical,
      jobTitle: profile.headline || undefined,
      address: profile.location
        ? { "@type": "PostalAddress", addressLocality: profile.location }
        : undefined,
    }).replace(/</g, "\\u003c");
    const links = [
      ["Portfolio", profile.links?.portfolio],
      ["LinkedIn", profile.links?.linkedin],
      ["GitHub", profile.links?.github],
    ]
      .map(([label, url]) => [label, this.safeWebUrl(url)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
      .map(
        ([label, url]) =>
          `<li><a href="${escapeHtml(url)}" rel="noopener noreferrer nofollow">${label}</a></li>`,
      )
      .join("");
    const experience = (profile.experience ?? [])
      .slice(0, 20)
      .map(
        (item) =>
          `<article><h3>${escapeHtml(item.title)} · ${escapeHtml(item.company)}</h3><p>${escapeHtml(item.location || "")} · ${escapeHtml(item.startDate)} – ${escapeHtml(item.current ? "Present" : item.endDate || "")}</p>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}</article>`,
      )
      .join("");
    const education = (profile.education ?? [])
      .slice(0, 20)
      .map(
        (item) =>
          `<article><h3>${escapeHtml(item.qualification)} · ${escapeHtml(item.institution)}</h3><p>${escapeHtml(item.fieldOfStudy || "")}</p></article>`,
      )
      .join("");
    response.type("html").set("Cache-Control", "private, no-store")
      .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description.slice(0, 300))}"><link rel="canonical" href="${escapeHtml(canonical)}"><script type="application/ld+json">${content}</script><style>body{margin:0;padding:24px;font:16px/1.6 system-ui,sans-serif;color:#18322b;background:#f7f8f5}main{max-width:900px;margin:6vh auto;padding:32px;border:1px solid #e1e8e1;border-radius:16px;background:white}h1{line-height:1.2}.muted{color:#52645c}article{padding:14px 0;border-top:1px solid #e1e8e1}a{color:#183d32}</style></head>
<body><main><p><a href="/">esllp · Jobs</a></p><h1>${escapeHtml(user.displayName)}</h1>${profile.headline ? `<p>${escapeHtml(profile.headline)}</p>` : ""}${profile.location ? `<p class="muted">${escapeHtml(profile.location)}</p>` : ""}${profile.summary ? `<section><h2>About</h2><p>${escapeHtml(profile.summary)}</p></section>` : ""}${skills.length ? `<section><h2>Skills</h2><p>${skills.map(escapeHtml).join(" · ")}</p></section>` : ""}${experience ? `<section><h2>Experience</h2>${experience}</section>` : ""}${education ? `<section><h2>Education</h2>${education}</section>` : ""}${links ? `<section><h2>Links</h2><ul>${links}</ul></section>` : ""}<p class="muted">Shared by the profile owner. Contact details and resume files are not displayed.</p></main></body></html>`);
  }

  private parseSkills(value: string): string[] {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed
            .filter((skill): skill is string => typeof skill === "string")
            .slice(0, 30)
        : [];
    } catch (error) {
      throw new Error("Stored profile skills have an invalid format.", {
        cause: error,
      });
    }
  }

  private safeWebUrl(value: string | undefined): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:"
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }
}
