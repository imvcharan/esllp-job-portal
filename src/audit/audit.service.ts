import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  record(input: {
    actorUserId: number;
    action: string;
    targetType: string;
    targetId: string | number;
    details?: Record<string, string | number | boolean | null>;
    ipAddress?: string;
  }): Promise<AuditLog> {
    return this.auditRepository.save(
      this.auditRepository.create({
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: String(input.targetId),
        details: input.details ? JSON.stringify(input.details) : null,
        ipAddress: input.ipAddress ?? null,
      }),
    );
  }

  list(page = 1, limit = 50): Promise<{
    items: AuditLog[];
    total: number;
    page: number;
    limit: number;
  }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    return this.auditRepository
      .findAndCount({
        order: { createdAt: 'DESC' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      })
      .then(([items, total]) => ({
        items,
        total,
        page: safePage,
        limit: safeLimit,
      }));
  }
}
