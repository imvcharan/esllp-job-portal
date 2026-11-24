import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { Client } from "@opensearch-project/opensearch";
import { DataSource, EntityManager } from "typeorm";
import type { Job } from "../jobs/job.entity";

@Injectable()
export class OpenSearchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenSearchService.name);
  private client: Client | null = null;
  private indexReady = false;
  private candidateIndexReady = false;
  private initialized = false;
  private processingOutbox = false;
  private outboxTimer: NodeJS.Timeout | null = null;
  private initializing: Promise<void> | null = null;
  private nextInitializationAttemptAt = 0;
  private readonly index = process.env.OPENSEARCH_INDEX?.trim() || "esllp-jobs";
  private readonly candidateIndex =
    process.env.OPENSEARCH_CANDIDATE_INDEX?.trim() || "esllp-candidates";

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    const url = process.env.OPENSEARCH_URL?.trim();
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("OPENSEARCH_URL must use http:// or https://.");
      }
      this.client = new Client({
        node: url,
        requestTimeout: 5_000,
        maxRetries: 1,
        ...(process.env.OPENSEARCH_USERNAME?.trim()
          ? {
              auth: {
                username: process.env.OPENSEARCH_USERNAME.trim(),
                password: process.env.OPENSEARCH_PASSWORD ?? "",
              },
            }
          : {}),
        ...(parsed.protocol === "https:"
          ? {
              ssl: {
                rejectUnauthorized:
                  process.env.OPENSEARCH_TLS_VERIFY !== "false",
              },
            }
          : {}),
      });
    } catch (error) {
      this.logger.warn(
        `OpenSearch disabled; PostgreSQL search remains available: ${error instanceof Error ? error.message : "invalid URL"}`,
      );
      return;
    }
    this.outboxTimer = setInterval(() => {
      void this.runOutboxCycle();
    }, 1_000);
    this.outboxTimer.unref();
    try {
      await this.initializeIndex();
      void this.runOutboxCycle();
    } catch (error) {
      this.logger.warn(
        `OpenSearch initialization failed; PostgreSQL search remains available: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  get ready(): boolean {
    return Boolean(this.client && this.indexReady);
  }

  onModuleDestroy(): void {
    if (this.outboxTimer) clearInterval(this.outboxTimer);
  }

  async ensureIndex(): Promise<void> {
    if (!this.client) return;
    const exists = await this.client.indices.exists({ index: this.index });
    if (exists.body) return;
    await this.client.indices.create({
      index: this.index,
      body: {
        settings: {
          index: { max_ngram_diff: 18 },
          analysis: {
            tokenizer: {
              job_edge_ngram: {
                type: "edge_ngram",
                min_gram: 2,
                max_gram: 20,
                token_chars: ["letter", "digit"],
              },
            },
            analyzer: {
              job_index_analyzer: {
                type: "custom",
                tokenizer: "job_edge_ngram",
                filter: ["lowercase"],
              },
            },
          },
        },
        mappings: {
          properties: {
            title: {
              type: "text",
              analyzer: "job_index_analyzer",
              search_analyzer: "standard",
            },
            company: {
              type: "text",
              analyzer: "job_index_analyzer",
              search_analyzer: "standard",
            },
            location: {
              type: "text",
              analyzer: "job_index_analyzer",
              search_analyzer: "standard",
            },
            description: { type: "text" },
            skills: {
              type: "text",
              analyzer: "job_index_analyzer",
              search_analyzer: "standard",
            },
            category: { type: "keyword" },
            industry: { type: "keyword" },
            workplaceType: { type: "keyword" },
            employmentType: { type: "keyword" },
            isActive: { type: "boolean" },
            applicationDeadline: { type: "date" },
            createdAt: { type: "date" },
          },
        },
      },
    });
  }

  private async initializeIndex(): Promise<void> {
    if (!this.client) return;
    if (this.initialized) {
      await this.refreshIndexReadiness();
      return;
    }
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      const jobIndexCreated = await this.ensureJobIndex();
      const candidateIndexCreated = await this.ensureCandidateIndex();
      await this.prepareBackfill(this.index, "job", jobIndexCreated);
      await this.prepareBackfill(
        this.candidateIndex,
        "candidate",
        candidateIndexCreated,
      );
      this.initialized = true;
      await this.refreshIndexReadiness();
      this.nextInitializationAttemptAt = 0;
    })();
    try {
      await this.initializing;
    } catch (error) {
      this.indexReady = false;
      this.candidateIndexReady = false;
      this.nextInitializationAttemptAt = Date.now() + 30_000;
      throw error;
    } finally {
      this.initializing = null;
    }
  }

  private async prepareBackfill(
    indexName: string,
    entityType: "job" | "candidate",
    indexCreated: boolean,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO search_index_backfills (index_name, entity_type)
       VALUES ($1, $2)
       ON CONFLICT (index_name, entity_type) DO NOTHING`,
      [indexName, entityType],
    );
    if (indexCreated) {
      await this.dataSource.query(
        `UPDATE search_index_backfills
         SET completed_at = NULL
         WHERE index_name = $1 AND entity_type = $2`,
        [indexName, entityType],
      );
    }
    const [state] = (await this.dataSource.query(
      `SELECT completed_at AS "completedAt"
       FROM search_index_backfills
       WHERE index_name = $1 AND entity_type = $2`,
      [indexName, entityType],
    )) as Array<{ completedAt: Date | null }>;
    if (state?.completedAt) return;

    if (entityType === "job") {
      await this.dataSource.query(`
        INSERT INTO search_index_outbox (entity_type, entity_id, operation)
        SELECT 'job', id, 'upsert' FROM jobs
        ON CONFLICT (entity_type, entity_id) DO NOTHING
      `);
    } else {
      await this.dataSource.query(`
        INSERT INTO search_index_outbox (entity_type, entity_id, operation)
        SELECT 'candidate', users.id, 'upsert'
        FROM candidate_profiles profile
        INNER JOIN users ON users.id = profile.user_id
        WHERE profile.profile_visibility = 'recruiters'
          AND users.role = 'candidate'
          AND users.is_active = true
        ON CONFLICT (entity_type, entity_id) DO NOTHING
      `);
    }
  }

  private async refreshIndexReadiness(): Promise<void> {
    const states = (await this.dataSource.query(
      `SELECT backfill.entity_type AS "entityType",
              backfill.completed_at AS "completedAt",
              EXISTS (
                SELECT 1
                FROM search_index_outbox outbox
                WHERE outbox.entity_type = backfill.entity_type
              ) AS "hasPending"
       FROM search_index_backfills backfill
       WHERE backfill.index_name IN ($1, $2)`,
      [this.index, this.candidateIndex],
    )) as Array<{
      entityType: "job" | "candidate";
      completedAt: Date | null;
      hasPending: boolean;
    }>;
    const job = states.find((state) => state.entityType === "job");
    const candidate = states.find((state) => state.entityType === "candidate");
    this.indexReady = Boolean(job?.completedAt && !job.hasPending);
    this.candidateIndexReady = Boolean(
      candidate?.completedAt && !candidate.hasPending,
    );
  }

  private async ensureJobIndex(): Promise<boolean> {
    if (!this.client) return false;
    const exists = await this.client.indices.exists({ index: this.index });
    if (exists.body) return false;
    await this.ensureIndex();
    return true;
  }

  private async ensureCandidateIndex(): Promise<boolean> {
    if (!this.client) return false;
    const exists = await this.client.indices.exists({
      index: this.candidateIndex,
    });
    if (exists.body) return false;
    await this.client.indices.create({
      index: this.candidateIndex,
      body: {
        settings: {
          index: { max_ngram_diff: 18 },
          analysis: {
            tokenizer: {
              candidate_ngram: {
                type: "ngram",
                min_gram: 2,
                max_gram: 20,
                token_chars: ["letter", "digit"],
              },
            },
            analyzer: {
              candidate_index_analyzer: {
                type: "custom",
                tokenizer: "candidate_ngram",
                filter: ["lowercase"],
              },
            },
          },
        },
        mappings: {
          properties: {
            displayName: {
              type: "text",
              analyzer: "candidate_index_analyzer",
              search_analyzer: "standard",
            },
            headline: {
              type: "text",
              analyzer: "candidate_index_analyzer",
              search_analyzer: "standard",
            },
            location: {
              type: "text",
              analyzer: "candidate_index_analyzer",
              search_analyzer: "standard",
            },
            skills: {
              type: "text",
              analyzer: "candidate_index_analyzer",
              search_analyzer: "standard",
            },
            discoverable: { type: "boolean" },
          },
        },
      },
    });
    return true;
  }

  async indexJob(job: Job): Promise<void> {
    if (!this.client) return;
    await this.client.index({
      index: this.index,
      id: String(job.id),
      body: {
        title: job.title,
        company: job.company,
        location: job.location,
        category: job.category,
        industry: job.industry,
        skills: job.skills,
        workplaceType: job.workplaceType,
        employmentType: job.employmentType,
        description: job.description,
        isActive: job.isActive,
        applicationDeadline: job.applicationDeadline,
        createdAt: job.createdAt,
      },
      refresh: "wait_for",
    });
  }

  async indexCandidate(
    candidateId: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (!this.client) return;
    await this.enqueueIndexRecord("candidate", candidateId, "upsert", manager);
  }

  async removeCandidate(
    candidateId: number,
    manager?: EntityManager,
  ): Promise<void> {
    await this.enqueueIndexRecord("candidate", candidateId, "delete", manager);
  }

  async enqueueJob(jobId: number, manager?: EntityManager): Promise<void> {
    if (!this.client) return;
    await this.enqueueIndexRecord("job", jobId, "upsert", manager);
  }

  async removeJob(jobId: number, manager?: EntityManager): Promise<void> {
    if (!this.client) return;
    await this.enqueueIndexRecord("job", jobId, "delete", manager);
  }

  private async enqueueIndexRecord(
    entityType: "job" | "candidate",
    entityId: number,
    operation: "upsert" | "delete",
    manager?: EntityManager,
  ): Promise<void> {
    const sql = `INSERT INTO search_index_outbox
         (entity_type, entity_id, operation, attempts, next_attempt_at, last_error)
       VALUES ($1, $2, $3, 0, now(), NULL)
       ON CONFLICT (entity_type, entity_id) DO UPDATE
       SET operation = EXCLUDED.operation,
           attempts = 0,
           next_attempt_at = now(),
           last_error = NULL`;
    const parameters = [entityType, entityId, operation];
    if (manager) await manager.query(sql, parameters);
    else await this.dataSource.query(sql, parameters);
  }

  private async removeCandidateDocument(candidateId: number): Promise<void> {
    if (!this.client) throw new Error("OpenSearch is not connected.");
    try {
      await this.client.delete({
        index: this.candidateIndex,
        id: String(candidateId),
      });
    } catch (error) {
      const status = (error as { meta?: { statusCode?: number } }).meta
        ?.statusCode;
      if (status !== 404) throw error;
    }
  }

  private async removeJobDocument(jobId: number): Promise<void> {
    if (!this.client) throw new Error("OpenSearch is not connected.");
    try {
      await this.client.delete({ index: this.index, id: String(jobId) });
    } catch (error) {
      const status = (error as { meta?: { statusCode?: number } }).meta
        ?.statusCode;
      if (status !== 404) throw error;
    }
  }

  private async applyIndexRecord(record: {
    entityType: "job" | "candidate";
    entityId: number;
    operation: "upsert" | "delete";
  }): Promise<void> {
    if (!this.client) throw new Error("OpenSearch is not connected.");
    if (record.operation === "delete") {
      if (record.entityType === "job") {
        await this.removeJobDocument(record.entityId);
      } else {
        await this.removeCandidateDocument(record.entityId);
      }
      return;
    }

    if (record.entityType === "job") {
      const jobs = (await this.dataSource.query(
        `SELECT id, title, company, location, category, industry, skills,
                workplace_type AS "workplaceType",
                employment_type AS "employmentType",
                description, is_active AS "isActive",
                application_deadline AS "applicationDeadline",
                created_at AS "createdAt"
         FROM jobs WHERE id = $1`,
        [record.entityId],
      )) as Job[];
      if (jobs.length) await this.indexJob(jobs[0]);
      else await this.removeJobDocument(record.entityId);
      return;
    }

    const candidates = (await this.dataSource.query(
      `SELECT users.id AS "candidateId",
              users.display_name AS "displayName",
              profile.headline,
              profile.location,
              profile.skills
       FROM candidate_profiles profile
       INNER JOIN users ON users.id = profile.user_id
       WHERE users.id = $1
         AND profile.profile_visibility = 'recruiters'
         AND users.role = 'candidate'
         AND users.is_active = true`,
      [record.entityId],
    )) as Array<{
      candidateId: number;
      displayName: string;
      headline: string;
      location: string;
      skills: string;
    }>;
    if (!candidates.length) {
      await this.removeCandidateDocument(record.entityId);
      return;
    }
    const [candidate] = candidates;
    await this.client.index({
      index: this.candidateIndex,
      id: String(record.entityId),
      body: {
        displayName: candidate.displayName,
        headline: candidate.headline,
        location: candidate.location,
        skills: candidate.skills,
        discoverable: true,
      },
      refresh: "wait_for",
    });
  }

  private async processOutbox(): Promise<void> {
    if (!this.client || this.processingOutbox || !this.initialized) return;
    this.processingOutbox = true;
    try {
      for (let count = 0; count < 20; count += 1) {
        const processed = await this.dataSource.transaction(async (manager) => {
          const records = (await manager.query(
            `SELECT id, entity_type AS "entityType",
                    entity_id AS "entityId", operation, attempts
             FROM search_index_outbox
             WHERE next_attempt_at <= now()
             ORDER BY id
             LIMIT 1
             FOR UPDATE SKIP LOCKED`,
          )) as Array<{
            id: number;
            entityType: "job" | "candidate";
            entityId: number;
            operation: "upsert" | "delete";
            attempts: number;
          }>;
          const record = records[0];
          if (!record) return false;
          try {
            await this.applyIndexRecord(record);
            await manager.query(
              "DELETE FROM search_index_outbox WHERE id = $1",
              [record.id],
            );
          } catch (error) {
            const attempts = record.attempts + 1;
            const retryDelay = Math.min(
              3_600_000,
              1_000 * 2 ** Math.min(attempts, 12),
            );
            const errorMessage =
              error instanceof Error
                ? error.message.slice(0, 1000)
                : "Unknown indexing error";
            await manager.query(
              `UPDATE search_index_outbox
               SET attempts = $2,
                   next_attempt_at = now() + ($3 * interval '1 millisecond'),
                   last_error = $4
               WHERE id = $1`,
              [record.id, attempts, retryDelay, errorMessage],
            );
            await manager.query(
              `UPDATE search_index_backfills
               SET completed_at = NULL
               WHERE entity_type = $1
                 AND index_name = $2`,
              [
                record.entityType,
                record.entityType === "job" ? this.index : this.candidateIndex,
              ],
            );
            this.logger.warn(
              `OpenSearch ${record.entityType} indexing retry scheduled for ${record.entityId}: ${errorMessage}`,
            );
          }
          return true;
        });
        if (!processed) break;
      }
      await this.completeBackfills();
      await this.refreshIndexReadiness();
    } catch (error) {
      this.indexReady = false;
      this.candidateIndexReady = false;
      this.logger.warn(
        `Search index outbox polling failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      this.processingOutbox = false;
    }
  }

  private async runOutboxCycle(): Promise<void> {
    if (!this.initialized) {
      if (Date.now() < this.nextInitializationAttemptAt) return;
      try {
        await this.initializeIndex();
      } catch {
        return;
      }
    }
    await this.processOutbox();
  }

  private async completeBackfills(): Promise<void> {
    await this.dataSource.query(
      `UPDATE search_index_backfills backfill
       SET completed_at = now()
       WHERE backfill.index_name IN ($1, $2)
         AND backfill.completed_at IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM search_index_outbox outbox
           WHERE outbox.entity_type = backfill.entity_type
         )`,
      [this.index, this.candidateIndex],
    );
  }

  async searchCandidateIds(query: string): Promise<number[] | null> {
    if (!this.client || !query.trim()) return null;
    const terms = query.trim().split(/\s+/);
    if (
      terms.length > 20 ||
      /\b(?:AND|OR|NOT)\b/i.test(query) ||
      terms.some((term) => !/^[\p{L}\p{N}]{2,20}$/u.test(term))
    ) {
      return null;
    }
    if (!this.candidateIndexReady) {
      if (Date.now() < this.nextInitializationAttemptAt) return null;
      try {
        await this.initializeIndex();
      } catch {
        return null;
      }
    }
    if (!this.candidateIndexReady) return null;
    try {
      const response = await this.client.search({
        index: this.candidateIndex,
        body: {
          query: {
            bool: {
              must: [
                { term: { discoverable: true } },
                {
                  multi_match: {
                    query: query.trim(),
                    fields: ["displayName", "headline", "location", "skills"],
                    type: "cross_fields",
                    operator: "and",
                  },
                },
              ],
            },
          },
          from: 0,
          size: 10_000,
        },
      });
      const totalHits = response.body.hits.total;
      const total =
        typeof totalHits === "number" ? totalHits : (totalHits?.value ?? 0);
      if (total > 10_000) {
        this.logger.warn(
          "OpenSearch candidate result set exceeds 10,000; using PostgreSQL search.",
        );
        return null;
      }
      return response.body.hits.hits
        .map((hit: { _id: string }) => Number(hit._id))
        .filter((id: number) => Number.isInteger(id) && id > 0);
    } catch (error) {
      this.logger.warn(
        `OpenSearch candidate query failed; falling back to PostgreSQL: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return null;
    }
  }

  async searchIds(filters: {
    query?: string;
    location?: string;
    page?: number;
    limit?: number;
  }): Promise<number[] | null> {
    if (!this.client) return null;
    const terms = `${filters.query ?? ""} ${filters.location ?? ""}`
      .trim()
      .split(/\s+/);
    if (terms.some((term) => term.length < 2 || term.length > 20)) {
      return null;
    }
    if (!this.indexReady) {
      if (Date.now() < this.nextInitializationAttemptAt) return null;
      try {
        await this.initializeIndex();
      } catch {
        return null;
      }
    }
    if (!this.indexReady) return null;
    const must: object[] = [{ term: { isActive: true } }];
    if (filters.query) {
      must.push({
        multi_match: {
          query: filters.query,
          fields: [
            "title^3",
            "company^2",
            "skills^2",
            "description",
            "location",
          ],
          fuzziness: "AUTO",
        },
      });
    }
    if (filters.location) {
      must.push({ match: { location: filters.location } });
    }
    try {
      const response = await this.client.search({
        index: this.index,
        body: {
          query: { bool: { must } },
          sort: [{ _score: "desc" }, { createdAt: "desc" }],
          from: 0,
          size: 10_000,
        },
      });
      const totalHits = response.body.hits.total;
      const total =
        typeof totalHits === "number" ? totalHits : (totalHits?.value ?? 0);
      if (total > 10_000) {
        this.logger.warn(
          "OpenSearch result set exceeds 10,000; using PostgreSQL search to preserve complete pagination.",
        );
        return null;
      }
      return response.body.hits.hits
        .map((hit: { _id: string }) => Number(hit._id))
        .filter((id: number) => Number.isInteger(id));
    } catch (error) {
      this.logger.warn(
        `OpenSearch query failed; falling back to PostgreSQL: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return null;
    }
  }
}
