import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { User } from '../users/user.entity';
import { AuditLocationService } from './audit-location.service';
import { auditRequestContext } from './audit-request-context';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly locationService: AuditLocationService,
  ) {}

  record(input: {
    actorUserId: number | null;
    action: string;
    targetType: string;
    targetId: string | number;
    details?: Record<string, string | number | boolean | null>;
    ipAddress?: string;
  }): Promise<AuditLog> {
    const requestContext = auditRequestContext.getStore();
    const ipAddress = input.ipAddress ?? requestContext?.ipAddress ?? null;
    const location = this.locationService.lookup(ipAddress);
    return this.auditRepository.save(
      this.auditRepository.create({
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: String(input.targetId),
        details: input.details ? JSON.stringify(input.details) : null,
        ipAddress,
        locationCity: location?.city ?? null,
        locationRegion: location?.region ?? null,
        locationCountry: location?.country ?? null,
        userAgent: requestContext?.userAgent?.slice(0, 1000) ?? null,
      }),
    );
  }

  async list(
    page = 1,
    limit = 50,
    filters: {
      query?: string;
      action?: string;
      targetType?: string;
      country?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<{
    items: AuditLog[];
    total: number;
    page: number;
    limit: number;
  }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const queryBuilder = this.auditRepository
      .createQueryBuilder("audit")
      .leftJoin(User, "actor", "actor.id = audit.actorUserId")
      .orderBy("audit.createdAt", "DESC")
      .addOrderBy("audit.id", "DESC");
    const search = filters.query?.trim();
    if (search) {
      queryBuilder.andWhere(
        "(audit.action ILIKE :search OR audit.targetType ILIKE :search OR audit.targetId ILIKE :search OR audit.details ILIKE :search OR audit.ipAddress ILIKE :search OR audit.locationCity ILIKE :search OR audit.locationRegion ILIKE :search OR audit.locationCountry ILIKE :search OR actor.email ILIKE :search OR actor.displayName ILIKE :search)",
        { search: `%${search}%` },
      );
    }
    if (filters.action) {
      queryBuilder.andWhere("audit.action = :action", {
        action: filters.action,
      });
    }
    if (filters.targetType) {
      queryBuilder.andWhere("audit.targetType = :targetType", {
        targetType: filters.targetType,
      });
    }
    if (filters.country) {
      queryBuilder.andWhere("audit.locationCountry ILIKE :country", {
        country: `%${filters.country.trim()}%`,
      });
    }
    const from = this.parseDateFilter(filters.from, false);
    const to = this.parseDateFilter(filters.to, true);
    if (from) queryBuilder.andWhere("audit.createdAt >= :from", { from });
    if (to) queryBuilder.andWhere("audit.createdAt < :to", { to });
    const [items, total] = await queryBuilder
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();
    const actorIds = [
      ...new Set(
        items
          .map((item) => item.actorUserId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const actors = actorIds.length
      ? await this.usersRepository.find({
          select: { id: true, displayName: true, email: true, role: true },
          where: actorIds.map((id) => ({ id })),
        })
      : [];
    const actorsById = new Map(actors.map((actor) => [actor.id, actor]));
    return {
      items: items.map((item) =>
        Object.assign(item, {
          actor: item.actorUserId ? actorsById.get(item.actorUserId) ?? null : null,
        }),
      ),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  private parseDateFilter(value: string | undefined, exclusiveEnd: boolean): Date | null {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException("Audit date filters must use YYYY-MM-DD.");
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException("Audit date filter is not a valid date.");
    }
    if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }
}
