import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: Redis | null = null;
  private lastWarningAt = 0;

  onModuleInit(): void {
    const url = process.env.REDIS_URL?.trim();
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
        throw new Error("REDIS_URL must use redis:// or rediss://.");
      }
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: false,
        connectTimeout: 5_000,
      });
      this.client.on("error", (error) => this.warnUnavailable(error.message));
    } catch (error) {
      this.warnUnavailable(
        error instanceof Error ? error.message : "invalid Redis configuration",
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => this.client?.disconnect());
    }
  }

  get ready(): boolean {
    return this.client?.status === "ready";
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async get(key: string): Promise<string | null> {
    if (!this.ready) return null;
    try {
      return await this.client!.get(key);
    } catch (error) {
      this.warnUnavailable(
        error instanceof Error ? error.message : "cache read failed",
      );
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds = 60): Promise<void> {
    if (!this.ready) return;
    try {
      await this.client!.set(key, value, "EX", ttlSeconds);
    } catch (error) {
      this.warnUnavailable(
        error instanceof Error ? error.message : "cache write failed",
      );
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    if (!this.ready) return;
    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await this.client!.scan(
          cursor,
          "MATCH",
          `${prefix}*`,
          "COUNT",
          500,
        );
        cursor = nextCursor;
        if (keys.length) await this.client!.del(...keys);
      } while (cursor !== "0");
    } catch {
      this.warnUnavailable("cache invalidation failed");
    }
  }

  private warnUnavailable(message: string): void {
    if (Date.now() - this.lastWarningAt < 30_000) return;
    this.lastWarningAt = Date.now();
    this.logger.warn(
      `Redis unavailable; PostgreSQL fallback is active: ${message}`,
    );
  }
}
