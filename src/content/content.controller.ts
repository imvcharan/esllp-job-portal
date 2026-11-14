import { Controller, Get, Param, ParseEnumPipe, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ContentType } from "./content-entry.entity";
import { ContentService } from "./content.service";

@Controller("content")
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async list(
    @Query("type", new ParseEnumPipe(ContentType, { optional: true }))
    type?: ContentType,
  ) {
    const entries = await this.contentService.listPublished(type);
    return entries.map((entry) => this.toPublicContent(entry));
  }

  @Get(":slug")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async get(@Param("slug") slug: string) {
    const entry = await this.contentService.findPublished(slug);
    return this.toPublicContent(entry);
  }

  private toPublicContent(
    entry: Awaited<ReturnType<ContentService["findPublished"]>>,
  ) {
    const {
      id,
      type,
      slug,
      title,
      summary,
      body,
      seoTitle,
      seoDescription,
      publishedAt,
      createdAt,
      updatedAt,
    } = entry;
    return {
      id,
      type,
      slug,
      title,
      summary,
      body,
      seoTitle,
      seoDescription,
      publishedAt,
      createdAt,
      updatedAt,
    };
  }
}
