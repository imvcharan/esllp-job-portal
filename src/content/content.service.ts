import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  DataSource,
  EntityManager,
  LessThanOrEqual,
  QueryFailedError,
  Repository,
} from "typeorm";
import { AuditService } from "../audit/audit.service";
import { ContentEntry, ContentType } from "./content-entry.entity";
import { ContentEntryRevision } from "./content-entry-revision.entity";
import { CreateContentEntryDto } from "./dto/create-content-entry.dto";
import { UpdateContentEntryDto } from "./dto/update-content-entry.dto";

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(ContentEntry)
    private readonly contentRepository: Repository<ContentEntry>,
    @InjectRepository(ContentEntryRevision)
    private readonly revisionsRepository: Repository<ContentEntryRevision>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async listPublished(type?: ContentType): Promise<ContentEntry[]> {
    return this.contentRepository.find({
      where: type
        ? {
            type,
            isPublished: true,
            publishedAt: LessThanOrEqual(new Date()),
          }
        : { isPublished: true, publishedAt: LessThanOrEqual(new Date()) },
      order: { publishedAt: "DESC", id: "DESC" },
      take: 100,
    });
  }

  async findPublished(slug: string): Promise<ContentEntry> {
    const entry = await this.contentRepository.findOne({
      where: {
        slug,
        isPublished: true,
        publishedAt: LessThanOrEqual(new Date()),
      },
    });
    if (!entry) throw new NotFoundException("Content not found");
    return entry;
  }

  listAll(): Promise<ContentEntry[]> {
    return this.contentRepository.find({
      order: { updatedAt: "DESC", id: "DESC" },
      take: 500,
    });
  }

  async listRevisions(contentEntryId: number): Promise<ContentEntryRevision[]> {
    const entry = await this.contentRepository.findOneBy({
      id: contentEntryId,
    });
    if (!entry) throw new NotFoundException("Content not found");
    return this.revisionsRepository.find({
      where: { contentEntryId },
      order: { version: "DESC" },
      take: 100,
    });
  }

  async create(
    actorId: number,
    dto: CreateContentEntryDto,
    ip?: string,
  ): Promise<ContentEntry> {
    const { publishAt, ...contentValues } = dto;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const contentRepository = manager.getRepository(ContentEntry);
        const entry = contentRepository.create({
          ...contentValues,
          isPublished: dto.isPublished ?? false,
          publishedAt: this.publicationTimestamp(
            dto.isPublished ?? false,
            publishAt,
          ),
          createdByUserId: actorId,
          updatedByUserId: actorId,
        });
        const saved = await contentRepository.save(entry);
        await this.saveRevision(manager, saved, actorId);
        await this.recordChange(actorId, "content.create", saved, ip, manager);
        return saved;
      });
    } catch (error) {
      this.throwIfSlugConflict(error);
      throw error;
    }
  }

  async update(
    actorId: number,
    id: number,
    dto: UpdateContentEntryDto,
    ip?: string,
  ): Promise<ContentEntry> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const contentRepository = manager.getRepository(ContentEntry);
        const entry = await contentRepository.findOne({
          where: { id },
          lock: { mode: "pessimistic_write" },
        });
        if (!entry) throw new NotFoundException("Content not found");

        const wasPublished = entry.isPublished;
        const currentPublishedAt = entry.publishedAt;
        const { publishAt, ...contentUpdates } = dto;
        Object.assign(entry, contentUpdates, { updatedByUserId: actorId });
        const isPublished = dto.isPublished ?? entry.isPublished;
        if (dto.isPublished === false) {
          entry.publishedAt = this.publicationTimestamp(false, publishAt);
        } else if (publishAt !== undefined) {
          const alreadyPublic =
            wasPublished &&
            currentPublishedAt !== null &&
            currentPublishedAt.getTime() <= Date.now();
          if (publishAt !== null || !alreadyPublic) {
            entry.publishedAt = this.publicationTimestamp(
              isPublished,
              publishAt,
            );
          }
        } else if (dto.isPublished === true && entry.publishedAt === null) {
          entry.publishedAt = this.publicationTimestamp(isPublished, publishAt);
        }
        const saved = await contentRepository.save(entry);
        await this.saveRevision(manager, saved, actorId);
        await this.recordChange(actorId, "content.update", saved, ip, manager);
        return saved;
      });
    } catch (error) {
      this.throwIfSlugConflict(error);
      throw error;
    }
  }

  async restoreRevision(
    actorId: number,
    contentEntryId: number,
    revisionId: number,
    ip?: string,
  ): Promise<ContentEntry> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const contentRepository = manager.getRepository(ContentEntry);
        const revisionsRepository = manager.getRepository(ContentEntryRevision);
        const entry = await contentRepository.findOne({
          where: { id: contentEntryId },
          lock: { mode: "pessimistic_write" },
        });
        if (!entry) throw new NotFoundException("Content not found");
        const revision = await revisionsRepository.findOneBy({
          id: revisionId,
          contentEntryId,
        });
        if (!revision) throw new NotFoundException("Content revision not found");

        Object.assign(entry, {
          type: revision.type,
          slug: revision.slug,
          title: revision.title,
          summary: revision.summary,
          body: revision.body,
          seoTitle: revision.seoTitle,
          seoDescription: revision.seoDescription,
          isPublished: revision.isPublished,
          publishedAt: revision.publishedAt,
          updatedByUserId: actorId,
        });
        const saved = await contentRepository.save(entry);
        await this.saveRevision(manager, saved, actorId);
        await this.recordChange(
          actorId,
          "content.restore",
          saved,
          ip,
          manager,
        );
        return saved;
      });
    } catch (error) {
      this.throwIfSlugConflict(error);
      throw error;
    }
  }

  private async saveRevision(
    manager: EntityManager,
    entry: ContentEntry,
    actorId: number,
  ): Promise<ContentEntryRevision> {
    const revisionsRepository = manager.getRepository(ContentEntryRevision);
    const latestRevision = await revisionsRepository.findOne({
      where: { contentEntryId: entry.id },
      order: { version: "DESC" },
    });
    return revisionsRepository.save(
      revisionsRepository.create({
        contentEntryId: entry.id,
        version: (latestRevision?.version ?? 0) + 1,
        type: entry.type,
        slug: entry.slug,
        title: entry.title,
        summary: entry.summary,
        body: entry.body,
        seoTitle: entry.seoTitle,
        seoDescription: entry.seoDescription,
        isPublished: entry.isPublished,
        publishedAt: entry.publishedAt,
        createdByUserId: actorId,
      }),
    );
  }

  private async recordChange(
    actorId: number,
    action: string,
    entry: ContentEntry,
    ip?: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.auditService.record(
      {
        actorUserId: actorId,
        action,
        targetType: "content",
        targetId: String(entry.id),
        details: {
          type: entry.type,
          slug: entry.slug,
          isPublished: entry.isPublished,
          scheduledAt:
            entry.isPublished &&
            entry.publishedAt &&
            entry.publishedAt.getTime() > Date.now()
              ? entry.publishedAt.toISOString()
              : null,
        },
        ipAddress: ip,
      },
      manager,
    );
  }

  private publicationTimestamp(
    isPublished: boolean,
    publishAt?: string | null,
  ): Date | null {
    if (!isPublished) {
      if (publishAt != null) {
        throw new BadRequestException(
          "Content must be marked published before it can be scheduled.",
        );
      }
      return null;
    }

    if (!publishAt) return new Date();
    const requestedAt = new Date(publishAt);
    if (Number.isNaN(requestedAt.getTime())) {
      throw new BadRequestException("Publish time must be a valid date.");
    }
    return requestedAt.getTime() > Date.now() ? requestedAt : new Date();
  }

  private throwIfSlugConflict(error: unknown): void {
    if (
      error instanceof QueryFailedError &&
      typeof error.driverError === "object" &&
      error.driverError !== null &&
      "code" in error.driverError &&
      error.driverError.code === "23505"
    ) {
      throw new ConflictException(
        "A content item with this slug already exists",
      );
    }
  }
}
