import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { backgroundWorkersEnabled } from "../infrastructure/process-role";
import { CandidateFileScanService } from "./candidate-file-scan.service";
import { CandidateFileStorageService } from "./candidate-file-storage.service";

interface ScanClaim {
  storagePath: string;
  attempts: number;
}

interface CleanupClaim {
  id: string;
  storagePath: string;
  attempts: number;
}

@Injectable()
export class CandidatePrivateFileProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CandidatePrivateFileProcessor.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: CandidateFileStorageService,
    private readonly scanner: CandidateFileScanService,
  ) {}

  onModuleInit(): void {
    if (!backgroundWorkersEnabled()) return;
    this.timer = setInterval(() => this.runCycle(), 60_000);
    this.timer.unref();
    this.runCycle();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async operationalStatus() {
    const [storage, scanner] = await Promise.all([
      this.storage.operationalStatus(),
      this.scanner.checkAvailability(),
    ]);
    return {
      storage,
      scanner: {
        configured: this.scanner.configured,
        ready: scanner,
      },
      counts: { scans: storage.scans, cleanup: storage.cleanup },
      workerEnabled: backgroundWorkersEnabled(),
    };
  }

  private runCycle(): void {
    if (this.processing) return;
    this.processing = true;
    void this.processCycle()
      .catch((error: unknown) => {
        this.logger.error(
          `Private file maintenance cycle failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      })
      .finally(() => {
        this.processing = false;
      });
  }

  private async processCycle(): Promise<void> {
    await this.pruneResumeHistory();
    await this.expirePendingDocuments();
    await this.scanPendingFiles();
    await this.queueInfectedFiles();
    await this.processCleanupOutbox();
  }

  private async pruneResumeHistory(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const stale = (await manager.query(
        `SELECT version.id, version.storage_path AS "storagePath"
         FROM candidate_resume_versions version
         INNER JOIN (
           SELECT version.id,
                  ROW_NUMBER() OVER (
                    PARTITION BY version.user_id
                    ORDER BY
                      (version.storage_path = profile.resume_path) DESC,
                      version.created_at DESC,
                      version.id DESC
                  ) AS position
           FROM candidate_resume_versions version
           LEFT JOIN candidate_profiles profile
             ON profile.user_id = version.user_id
         ) ranked ON ranked.id = version.id
         WHERE ranked.position > 20
         ORDER BY version.created_at ASC, version.id ASC
         LIMIT 500
         FOR UPDATE OF version SKIP LOCKED`,
      )) as Array<{ id: number; storagePath: string }>;
      if (!stale.length) return;
      const paths = stale.map(({ storagePath }) => storagePath);
      const applicationPaths = (await manager.query(
        `SELECT DISTINCT resume_path AS path
         FROM candidate_applications
         WHERE resume_path = ANY($1::text[])`,
        [paths],
      )) as Array<{ path: string }>;
      const retainedForApplications = new Set(
        applicationPaths.map(({ path }) => path),
      );
      await this.storage.enqueueCleanup(
        paths.filter((path) => !retainedForApplications.has(path)),
        manager,
      );
      await manager.query(
        `DELETE FROM candidate_resume_versions
         WHERE id = ANY($1::int[])`,
        [stale.map(({ id }) => id)],
      );
    });
  }

  private async expirePendingDocuments(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const stale = (await manager.query(
        `SELECT id, file_path AS path
         FROM candidate_application_documents
         WHERE application_id IS NULL
           AND created_at <= now() - INTERVAL '30 days'
         ORDER BY created_at ASC, id ASC
         LIMIT 500
         FOR UPDATE SKIP LOCKED`,
      )) as Array<{ id: number; path: string }>;
      if (!stale.length) return;
      await this.storage.enqueueCleanup(
        stale.map(({ path }) => path),
        manager,
      );
      await manager.query(
        `DELETE FROM candidate_application_documents
         WHERE id = ANY($1::int[])`,
        [stale.map(({ id }) => id)],
      );
    });
  }

  private async scanPendingFiles(): Promise<void> {
    const claimToken = randomUUID();
    const records = (await this.dataSource.query(
      `WITH due AS (
         SELECT storage_path
         FROM candidate_private_file_scans
         WHERE status = 'pending'
           AND next_attempt_at <= now()
           AND (claimed_until IS NULL OR claimed_until < now())
         ORDER BY next_attempt_at, created_at
         LIMIT 10
         FOR UPDATE SKIP LOCKED
       )
       UPDATE candidate_private_file_scans file_scan
       SET claim_token = $1,
           claimed_until = now() + INTERVAL '2 minutes'
       FROM due
       WHERE file_scan.storage_path = due.storage_path
       RETURNING file_scan.storage_path AS "storagePath",
                 file_scan.attempts`,
      [claimToken],
    )) as ScanClaim[];
    for (const record of records) {
      try {
        const file = await this.storage.downloadForScan(record.storagePath);
        await this.scanner.scan(file);
        await this.dataSource.query(
          `UPDATE candidate_private_file_scans
           SET status = 'clean',
               attempts = 0,
               claim_token = NULL,
               claimed_until = NULL,
               scanned_at = now(),
               last_error = NULL
           WHERE storage_path = $1 AND claim_token = $2`,
          [record.storagePath, claimToken],
        );
      } catch (error) {
        const infected = error instanceof BadRequestException;
        const attempts = record.attempts + 1;
        const delay = Math.min(3_600_000, 1_000 * 2 ** Math.min(attempts, 12));
        const reason = infected
          ? "Malware detected by ClamAV."
          : error instanceof Error
            ? error.message
            : "Unknown malware scan failure.";
        await this.dataSource.query(
          `UPDATE candidate_private_file_scans
           SET status = $3,
               attempts = $4,
               next_attempt_at = now() + ($5 * interval '1 millisecond'),
               claim_token = NULL,
               claimed_until = NULL,
               scanned_at = CASE WHEN $3 = 'infected' THEN now() ELSE scanned_at END,
               last_error = $6
           WHERE storage_path = $1 AND claim_token = $2`,
          [
            record.storagePath,
            claimToken,
            infected ? "infected" : "pending",
            attempts,
            delay,
            reason.slice(0, 1000),
          ],
        );
        if (infected) {
          this.logger.error(
            "A legacy candidate file was rejected by the malware scanner.",
          );
        } else {
          this.logger.warn(
            `Legacy candidate file scan will retry after failure (${attempts} attempts).`,
          );
        }
      }
    }
  }

  private async processCleanupOutbox(): Promise<void> {
    const claimToken = randomUUID();
    const records = (await this.dataSource.query(
      `WITH due AS (
         SELECT id
         FROM candidate_private_file_cleanup_outbox
         WHERE next_attempt_at <= now()
           AND (claimed_until IS NULL OR claimed_until < now())
         ORDER BY next_attempt_at, id
         LIMIT 100
         FOR UPDATE SKIP LOCKED
       )
       UPDATE candidate_private_file_cleanup_outbox cleanup
       SET claim_token = $1,
           claimed_until = now() + INTERVAL '2 minutes'
       FROM due
       WHERE cleanup.id = due.id
       RETURNING cleanup.id, cleanup.storage_path AS "storagePath",
                 cleanup.attempts`,
      [claimToken],
    )) as CleanupClaim[];

    for (const record of records) {
      try {
        if (await this.isReferenced(record.storagePath)) {
          await this.dataSource.query(
            `DELETE FROM candidate_private_file_cleanup_outbox
             WHERE id = $1 AND claim_token = $2`,
            [record.id, claimToken],
          );
          continue;
        }
        await this.storage.remove(record.storagePath);
        await this.dataSource.transaction(async (manager) => {
          await manager.query(
            `DELETE FROM candidate_private_file_cleanup_outbox
             WHERE id = $1 AND claim_token = $2`,
            [record.id, claimToken],
          );
          await this.storage.deleteScanState([record.storagePath], manager);
        });
      } catch (error) {
        const attempts = record.attempts + 1;
        const delay = Math.min(3_600_000, 1_000 * 2 ** Math.min(attempts, 12));
        const reason =
          error instanceof Error ? error.message : "Unknown cleanup failure.";
        await this.dataSource.query(
          `UPDATE candidate_private_file_cleanup_outbox
           SET attempts = $3,
               next_attempt_at = now() + ($4 * interval '1 millisecond'),
               claim_token = NULL,
               claimed_until = NULL,
               last_error = $5
           WHERE id = $1 AND claim_token = $2`,
          [record.id, claimToken, attempts, delay, reason.slice(0, 1000)],
        );
        this.logger.warn(
          `Private file cleanup will retry after failure (${attempts} attempts).`,
        );
      }
    }
  }

  private async queueInfectedFiles(): Promise<void> {
    const records = (await this.dataSource.query(
      `SELECT storage_path AS "storagePath"
       FROM candidate_private_file_scans
       WHERE status = 'infected'`,
    )) as Array<{ storagePath: string }>;
    await this.storage.enqueueCleanup(
      records.map(({ storagePath }) => storagePath),
    );
  }

  private async isReferenced(path: string): Promise<boolean> {
    const [result] = (await this.dataSource.query(
      `SELECT EXISTS (
         SELECT 1 FROM candidate_profiles
         WHERE photo_path = $1 OR resume_path = $1
         UNION ALL
         SELECT 1 FROM candidate_resume_versions WHERE storage_path = $1
         UNION ALL
         SELECT 1 FROM candidate_application_documents WHERE file_path = $1
         UNION ALL
         SELECT 1 FROM candidate_applications WHERE resume_path = $1
       ) AND NOT EXISTS (
         SELECT 1 FROM candidate_private_file_scans
         WHERE storage_path = $1 AND status = 'infected'
       ) AS referenced`,
      [path],
    )) as Array<{ referenced: boolean }>;
    return result?.referenced === true;
  }
}
