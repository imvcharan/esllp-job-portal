import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Queue, Worker, type Processor, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

@Injectable()
export class JobQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobQueueService.name);
  private connection: IORedis | null = null;
  private redisUrl: string | null = null;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();

  onModuleInit(): void {
    const url = process.env.REDIS_URL?.trim();
    if (!url) return;
    try {
      this.redisUrl = url;
      this.connectionOptions(1);
      this.connection = new IORedis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });
      this.connection.on("error", (error) =>
        this.logger.warn(`BullMQ Redis unavailable: ${error.message}`),
      );
    } catch (error) {
      this.redisUrl = null;
      this.logger.error(
        `BullMQ disabled because REDIS_URL is invalid: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  get ready(): boolean {
    return this.connection?.status === "ready";
  }

  get enabled(): boolean {
    return this.redisUrl !== null;
  }

  private connectionOptions(
    maxRetriesPerRequest: number | null,
  ): ConnectionOptions {
    if (!this.redisUrl) throw new Error("REDIS_URL is not configured.");
    const url = new URL(this.redisUrl);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      throw new Error("REDIS_URL must use redis:// or rediss://.");
    }
    const database =
      url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;
    if (
      database !== undefined &&
      (!Number.isInteger(database) || database < 0)
    ) {
      throw new Error(
        "REDIS_URL database path must be a non-negative integer.",
      );
    }
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(database !== undefined ? { db: database } : {}),
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
      maxRetriesPerRequest,
      enableReadyCheck: true,
    };
  }

  private queue(name: string): Queue | null {
    if (!this.connection) return null;
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.connectionOptions(1),
      });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async add(
    name: string,
    jobName: string,
    data: object,
    delayMs = 0,
  ): Promise<boolean> {
    try {
      const queue = this.queue(name);
      if (!queue) return false;
      await queue.add(jobName, data, {
        delay: Math.max(0, delayMs),
        removeOnComplete: 500,
        removeOnFail: 2000,
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `BullMQ enqueue failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return false;
    }
  }

  registerWorker(name: string, processor: Processor): void {
    if (!this.connection || this.workers.has(name)) return;
    const configuredConcurrency = Number(
      process.env.BULLMQ_WORKER_CONCURRENCY ?? 5,
    );
    const concurrency =
      Number.isInteger(configuredConcurrency) &&
      configuredConcurrency >= 1 &&
      configuredConcurrency <= 100
        ? configuredConcurrency
        : 5;
    if (concurrency !== configuredConcurrency) {
      this.logger.warn(
        "BULLMQ_WORKER_CONCURRENCY must be an integer from 1 to 100; using 5.",
      );
    }
    const worker = new Worker(name, processor, {
      connection: this.connectionOptions(null),
      concurrency,
    });
    worker.on("error", (error) =>
      this.logger.warn(`BullMQ worker ${name} unavailable: ${error.message}`),
    );
    worker.on("failed", (job, error) =>
      this.logger.error(
        `BullMQ job ${name}/${job?.id ?? "unknown"} failed: ${error.message}`,
      ),
    );
    this.workers.set(name, worker);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      ...Array.from(this.workers.values(), (worker) => worker.close()),
      ...Array.from(this.queues.values(), (queue) => queue.close()),
    ]);
    if (this.connection)
      await this.connection.quit().catch(() => this.connection?.disconnect());
  }
}
