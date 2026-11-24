import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { RedisCacheService } from "./infrastructure/redis-cache.service";
import { JobQueueService } from "./infrastructure/job-queue.service";
import { OpenSearchService } from "./infrastructure/open-search.service";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startedAt = Date.now();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisCache: RedisCacheService | null = null,
    private readonly jobQueue: JobQueueService | null = null,
    private readonly openSearch: OpenSearchService | null = null,
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

    return { status: "ready", checks: { database: "ok" } };
  }

  @Get("metrics")
  getMetrics() {
    const memory = process.memoryUsage();
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
    };
  }
}
