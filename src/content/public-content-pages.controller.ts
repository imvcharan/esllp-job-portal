import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Response } from "express";
import { ContentType } from "./content-entry.entity";
import { ContentService } from "./content.service";

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

const publicOrigin = (): string => {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (!configured) {
    throw new ServiceUnavailableException(
      "PUBLIC_APP_URL must be configured to serve canonical content pages.",
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
export class PublicContentPagesController {
  constructor(private readonly contentService: ContentService) {}

  @Get("pages/:slug")
  async show(
    @Param("slug") slug: string,
    @Res() response: Response,
  ): Promise<void> {
    const entry = await this.contentService.findPublished(slug);
    if (entry.type === ContentType.FAQ) {
      throw new NotFoundException("This content page is not available.");
    }

    const origin = publicOrigin();
    const canonical = `${origin}/pages/${encodeURIComponent(entry.slug)}`;
    const appUrl = `${origin}/#content/${encodeURIComponent(entry.slug)}`;
    const title = `${entry.seoTitle || entry.title} — esllp`;
    const description = (
      entry.seoDescription ||
      entry.summary ||
      entry.body.replace(/\s+/g, " ").trim()
    ).slice(0, 300);
    const paragraphs = entry.body
      .split(/\n{2,}/)
      .map(
        (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
      )
      .join("");

    response
      .type("text/html")
      .set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
      .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <style>body{margin:0;padding:32px;font:16px/1.6 system-ui,sans-serif;color:#18322b;background:#f7f8f5}main{max-width:760px;margin:8vh auto;padding:32px;border:1px solid #e1e8e1;border-radius:16px;background:white}h1{line-height:1.2}p{color:#52645c}.button{display:inline-block;margin-top:20px;padding:12px 18px;border-radius:8px;color:white;background:#183d32;text-decoration:none;font-weight:700}</style>
</head>
<body><main><p>esllp · ${escapeHtml(entry.type)}</p><h1>${escapeHtml(entry.title)}</h1>${entry.summary ? `<p>${escapeHtml(entry.summary)}</p>` : ""}${paragraphs}<a class="button" href="${escapeHtml(appUrl)}">Read on esllp</a></main></body>
</html>`);
  }
}
