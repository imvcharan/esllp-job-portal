import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Queue, Worker, type Processor, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { randomUUID } from "node:crypto";
import { appProcessRole } from "./process-role";

@Injectable()
export class JobQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobQueueService.name);
  private connection: IORedis | null = null;
  private redisUrl: string | null = null;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly heartbeatKey = `esllp:background-worker:${randomUUID()}`;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    const processRole = appProcessRole();
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
      if (processRole !== "web") {
        void this.updateWorkerHeartbeat();
        this.heartbeatTimer = setInterval(() => {
          void this.updateWorkerHeartbeat();
        }, 15_000);
        this.heartbeatTimer.unref();
      }
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
    jobId?: string,
  ): Promise<boolean> {
    try {
      const queue = this.queue(name);
      if (!queue) return false;
      await queue.add(jobName, data, {
        delay: Math.max(0, delayMs),
        ...(jobId ? { jobId } : {}),
        removeOnComplete: jobId ? true : 500,
        removeOnFail: jobId ? true : 2000,
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

  registerWorker(
    name: string,
    processor: Processor,
    requestedConcurrency?: number,
  ): void {
    if (
      !this.connection ||
      appProcessRole() === "web" ||
      this.workers.has(name)
    ) {
      return;
    }
    const configuredConcurrency =
      requestedConcurrency ??
      Number(process.env.BULLMQ_WORKER_CONCURRENCY ?? 5);
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

  async operationalStatus(): Promise<{
    enabled: boolean;
    ready: boolean;
    activeWorkerInstances: number;
    queues: Array<{
      name: string;
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
    }>;
  }> {
    if (!this.enabled || !this.ready) {
      return {
        enabled: this.enabled,
        ready: this.ready,
        activeWorkerInstances: 0,
        queues: [],
      };
    }

    const [queues, activeWorkerInstances] = await Promise.all([
      Promise.all(
        ["notifications", "interview-reminders"].map(async (name) => {
          const queue = this.queue(name);
          if (!queue) {
            throw new Error(`BullMQ queue ${name} is unavailable.`);
          }
          const counts = await queue.getJobCounts(
            "waiting",
            "active",
            "delayed",
            "failed",
          );
          return {
            name,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            delayed: counts.delayed ?? 0,
            failed: counts.failed ?? 0,
          };
        }),
      ),
      this.countActiveWorkers(),
    ]);
    return { enabled: true, ready: true, activeWorkerInstances, queues };
  }

  private async updateWorkerHeartbeat(): Promise<void> {
    if (!this.connection) return;
    try {
      await this.connection.set(
        this.heartbeatKey,
        new Date().toISOString(),
        "EX",
        45,
      );
    } catch (error) {
      this.logger.warn(
        `Background worker heartbeat update failed: ${error instanceof Error ? error.message : "unknown Redis error"}`,
      );
    }
  }

  private async countActiveWorkers(): Promise<number> {
    if (!this.connection) return 0;
    let cursor = "0";
    let count = 0;
    do {
      const [nextCursor, keys] = await this.connection.scan(
        cursor,
        "MATCH",
        "esllp:background-worker:*",
        "COUNT",
        100,
      );
      cursor = nextCursor;
      count += keys.length;
    } while (cursor !== "0");
    return count;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await Promise.all([
      ...Array.from(this.workers.values(), (worker) => worker.close()),
      ...Array.from(this.queues.values(), (queue) => queue.close()),
    ]);
    if (this.connection) {
      await this.connection.quit().catch(() => this.connection?.disconnect());
    }
  }
}
