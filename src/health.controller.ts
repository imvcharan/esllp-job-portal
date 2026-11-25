import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  Optional,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { DataSource } from "typeorm";
import { RedisCacheService } from "./infrastructure/redis-cache.service";
import { JobQueueService } from "./infrastructure/job-queue.service";
import { OpenSearchService } from "./infrastructure/open-search.service";
import { WorkerHeartbeatService } from "./infrastructure/worker-heartbeat.service";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startedAt = Date.now();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional()
    @Inject(RedisCacheService)
    private readonly redisCache: RedisCacheService | null = null,
    @Optional()
    @Inject(JobQueueService)
    private readonly jobQueue: JobQueueService | null = null,
    @Optional()
    @Inject(OpenSearchService)
    private readonly openSearch: OpenSearchService | null = null,
    @Optional()
    @Inject(WorkerHeartbeatService)
    private readonly workerHeartbeats: WorkerHeartbeatService | null = null,
  ) {}

  @Get("live")
  getLiveness() {
    return { status: "ok" };
  }

  @Get("ready")
  async getReadiness() {
    if (!this.dataSource.isInitialized) {
      throw new ServiceUnavailableException("Database is unavailable.");
    }

    try {
      await this.dataSource.query("SELECT 1");
    } catch (error) {
      this.logger.error(
        `Database readiness probe failed (${error instanceof Error ? error.name : "unknown error"}).`,
      );
      throw new ServiceUnavailableException("Database is unavailable.");
    }

    return {
      status: "ready",
      checks: {
        database: "ok",
        redisCache: this.redisCache?.ready ? "ok" : "optional_unavailable",
        bullMq: this.jobQueue?.ready ? "ok" : "optional_unavailable",
        openSearch: this.openSearch?.ready ? "ok" : "optional_unavailable",
      },
    };
  }

  @Get("metrics")
  async getMetrics(@Req() request: Request) {
    this.authorizeMetrics(request);
    const memory = process.memoryUsage();
    const [emailOutbox, searchOutbox, workerHeartbeat] = await Promise.all([
      this.dataSource.query(`
        SELECT COUNT(*) FILTER (
                 WHERE status IN ('queued', 'retrying')
               )::int AS pending,
               COUNT(*) FILTER (
                 WHERE status = 'failed'
               )::int AS failed,
               EXTRACT(EPOCH FROM (
                 now() - MIN(created_at) FILTER (
                   WHERE status IN ('queued', 'retrying')
                 )
               ))::int AS "oldestPendingAgeSeconds"
        FROM email_notification_outbox
      `),
      this.dataSource.query(`
        SELECT COUNT(*) FILTER (
                 WHERE next_attempt_at <= now()
                   AND (claimed_until IS NULL OR claimed_until < now())
               )::int AS due,
               COUNT(*) FILTER (WHERE attempts >= 5)::int AS "highAttempts",
               EXTRACT(EPOCH FROM (
                 now() - MIN(created_at)
               ))::int AS "oldestPendingAgeSeconds",
               COUNT(*)::int AS pending
        FROM search_index_outbox
      `),
      this.workerHeartbeats?.status() ?? Promise.resolve(null),
    ]);
    return {
      status: "ok",
      uptimeSeconds: Math.max(
        0,
        Math.floor((Date.now() - this.startedAt) / 1000),
      ),
      process: {
        pid: process.pid,
        node: process.version,
      },
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
      },
      integrations: {
        redisCache: this.redisCache?.ready ?? false,
        bullMq: this.jobQueue?.ready ?? false,
        openSearch: this.openSearch?.ready ?? false,
      },
      outboxes: {
        email: emailOutbox[0] ?? {},
        searchIndex: searchOutbox[0] ?? {},
      },
      workers: workerHeartbeat,
    };
  }

  private authorizeMetrics(request: Request) {
    const configuredToken = process.env.METRICS_BEARER_TOKEN?.trim();
    if (!configuredToken || configuredToken.length < 32)
      throw new ServiceUnavailableException(
        "Metrics access is disabled until METRICS_BEARER_TOKEN is configured with at least 32 characters.",
      );
    const authorization = request.get("authorization") ?? "";
    const suppliedToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    const expected = Buffer.from(configuredToken);
    const supplied = Buffer.from(suppliedToken);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new ForbiddenException("Metrics authorization is required.");
  }
}
