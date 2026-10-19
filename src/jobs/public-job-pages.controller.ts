import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Response } from "express";
import { Repository } from "typeorm";
import { Job } from "./job.entity";
import { JobsService } from "./jobs.service";

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

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });

const plainText = (value: string): string =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);

const publicOrigin = (): string => {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (!configured) {
    throw new ServiceUnavailableException(
      "PUBLIC_APP_URL must be configured to serve canonical job pages.",
    );
  }
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new ServiceUnavailableException(
      "PUBLIC_APP_URL must be a valid absolute URL.",
    );
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ServiceUnavailableException(
      "PUBLIC_APP_URL must use HTTP or HTTPS.",
    );
  }
  return url.origin;
};

@Controller()
export class PublicJobPagesController {
  constructor(
    private readonly jobsService: JobsService,
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
  ) {}

  @Get("share/jobs/:id")
  async share(
    @Param("id", ParseIntPipe) id: number,
    @Res() response: Response,
  ): Promise<void> {
    const job = await this.jobsService.findOne(id);
    if (!job) throw new NotFoundException("This job is no longer available.");

    const origin = publicOrigin();
    const canonical = `${origin}/share/jobs/${job.id}`;
    const appJobUrl = `${origin}/#job/${encodeURIComponent(job.id)}`;
    const description =
      plainText(job.description ?? "") ||
      `${job.title} at ${job.company} in ${job.location}.`;
    const title = `${job.title} at ${job.company} — esllp`;
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: job.title,
      description,
      identifier: {
        "@type": "PropertyValue",
        name: job.company,
        value: job.id,
      },
      datePosted: job.createdAt.toISOString(),
      employmentType: this.schemaEmploymentType(job.employmentType),
      numberOfOpenings: job.numberOfOpenings,
      validThrough: job.applicationDeadline
        ? new Date(`${job.applicationDeadline}T23:59:59+05:30`).toISOString()
        : undefined,
      hiringOrganization: { "@type": "Organization", name: job.company },
      jobLocationType:
        job.workplaceType === "remote" ? "TELECOMMUTE" : undefined,
      jobLocation:
        job.workplaceType === "remote"
          ? undefined
          : {
              "@type": "Place",
              address: {
                "@type": "PostalAddress",
                addressLocality: job.location,
              },
            },
      baseSalary:
        job.salaryMin === null && job.salaryMax === null
          ? undefined
          : {
              "@type": "MonetaryAmount",
              currency: job.salaryCurrency,
              value: {
                "@type": "QuantitativeValue",
                ...(job.salaryMin === null ? {} : { minValue: job.salaryMin }),
                ...(job.salaryMax === null ? {} : { maxValue: job.salaryMax }),
                unitText: job.salaryPeriod.toUpperCase(),
              },
            },
      url: canonical,
    };
    const jsonLd = JSON.stringify(structuredData).replace(/</g, "\\u003c");
    response
      .type("html")
      .set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
      .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description.slice(0, 300))}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description.slice(0, 300))}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta name="twitter:card" content="summary">
  <script type="application/ld+json">${jsonLd}</script>
  <style>body{margin:0;padding:32px;font:16px/1.6 system-ui,sans-serif;color:#18322b;background:#f7f8f5}main{max-width:720px;margin:8vh auto;padding:32px;border:1px solid #e1e8e1;border-radius:16px;background:white}h1{line-height:1.2}p{color:#52645c}.details{display:flex;gap:16px;flex-wrap:wrap}.button{display:inline-block;margin-top:20px;padding:12px 18px;border-radius:8px;color:white;background:#183d32;text-decoration:none;font-weight:700}</style>
</head>
<body><main><p>esllp · Job opportunity</p><h1>${escapeHtml(job.title)}</h1><p>${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p><div class="details"><span>${escapeHtml(job.workplaceType)}</span><span>${escapeHtml(job.employmentType)}</span>${job.experience ? `<span>${escapeHtml(job.experience)}</span>` : ""}<span>${job.numberOfOpenings} opening${job.numberOfOpenings === 1 ? "" : "s"}</span>${job.applicationDeadline ? `<span>Apply by ${escapeHtml(job.applicationDeadline)}</span>` : ""}${job.salaryMin !== null || job.salaryMax !== null ? `<span>${escapeHtml(job.salaryCurrency)} ${job.salaryMin ?? ""}${job.salaryMin !== null && job.salaryMax !== null ? "–" : ""}${job.salaryMax ?? ""} / ${escapeHtml(job.salaryPeriod)}</span>` : ""}</div><p>${escapeHtml(description)}</p><a class="button" href="${escapeHtml(appJobUrl)}">View job and apply</a></main></body>
</html>`);
  }

  @Get("sitemap.xml")
  async sitemap(@Res() response: Response): Promise<void> {
    const origin = publicOrigin();
    const jobs = await this.jobsRepository
      .createQueryBuilder("job")
      .select(["job.id", "job.createdAt"])
      .where("job.isActive = :isActive", { isActive: true })
      .andWhere(
        "(job.applicationDeadline IS NULL OR job.applicationDeadline >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)",
      )
      .orderBy("job.createdAt", "DESC")
      .addOrderBy("job.id", "DESC")
      .take(50_000)
      .getMany();
    const urls = [
      `<url><loc>${escapeXml(origin)}/</loc></url>`,
      ...jobs.map(
        (job) =>
          `<url><loc>${escapeXml(`${origin}/share/jobs/${job.id}`)}</loc><lastmod>${job.createdAt.toISOString()}</lastmod></url>`,
      ),
    ];
    response
      .type("application/xml")
      .set("Cache-Control", "public, max-age=300")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`,
      );
  }

  @Get("robots.txt")
  robots(@Res() response: Response): void {
    const origin = publicOrigin();
    response
      .type("text/plain")
      .set("Cache-Control", "public, max-age=3600")
      .send(
        `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${origin}/sitemap.xml\n`,
      );
  }

  private schemaEmploymentType(type: string): string {
    return (
      {
        "full-time": "FULL_TIME",
        "part-time": "PART_TIME",
        contract: "CONTRACTOR",
        internship: "INTERN",
        temporary: "TEMPORARY",
      }[type] ?? type.toUpperCase()
    );
  }
}
