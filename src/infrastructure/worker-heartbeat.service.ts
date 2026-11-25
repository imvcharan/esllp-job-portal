import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { appProcessRole, backgroundWorkersEnabled } from "./process-role";

@Injectable()
export class WorkerHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private readonly instanceId = `${process.env.HOSTNAME || "app"}-${process.pid}-${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private lastRetentionSweepAt = 0;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onModuleInit() {
    if (!backgroundWorkersEnabled()) return;
    void this.writeHeartbeat();
    this.timer = setInterval(() => {
      void this.writeHeartbeat();
    }, 20_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async status() {
    const rows = (await this.dataSource.query(`
      SELECT COUNT(*) FILTER (
               WHERE last_seen_at >= now() - INTERVAL '90 seconds'
             )::int AS "activeInstances",
             MAX(last_seen_at) AS "latestHeartbeatAt"
      FROM background_worker_heartbeats
    `)) as Array<{
      activeInstances: number | string;
      latestHeartbeatAt: Date | null;
    }>;
    return {
      activeInstances: Number(rows[0]?.activeInstances ?? 0),
      latestHeartbeatAt: rows[0]?.latestHeartbeatAt?.toISOString() ?? null,
    };
  }

  private async writeHeartbeat() {
    try {
      await this.dataSource.query(
        `INSERT INTO background_worker_heartbeats
           (instance_id, process_role, process_id, last_seen_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (instance_id) DO UPDATE
         SET last_seen_at = now(), process_role = EXCLUDED.process_role,
             process_id = EXCLUDED.process_id`,
        [this.instanceId, appProcessRole(), process.pid],
      );
      await this.dataSource.query(
        `DELETE FROM background_worker_heartbeats
         WHERE last_seen_at < now() - INTERVAL '7 days'`,
      );
      if (Date.now() - this.lastRetentionSweepAt >= 24 * 60 * 60 * 1000) {
        await this.dataSource.query(
          `DELETE FROM razorpay_webhook_events
           WHERE received_at < now() - INTERVAL '180 days'`,
        );
        this.lastRetentionSweepAt = Date.now();
      }
    } catch (error) {
      this.logger.error(
        `Worker heartbeat write failed: ${
          error instanceof Error ? error.message : "unknown database error"
        }`,
      );
    }
  }
}
