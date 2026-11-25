import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { InjectDataSource } from "@nestjs/typeorm";
import { Client } from "@opensearch-project/opensearch";
import { DataSource, EntityManager } from "typeorm";
import type { Job } from "../jobs/job.entity";
import { backgroundWorkersEnabled } from "./process-role";

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
    const workersEnabled = backgroundWorkersEnabled();
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
    if (workersEnabled) {
      this.outboxTimer = setInterval(() => {
        void this.runOutboxCycle();
      }, 1_000);
      this.outboxTimer.unref();
    }
    try {
      await this.initializeIndex();
      if (workersEnabled) void this.runOutboxCycle();
    } catch (error) {
      this.logger.warn(
        `OpenSearch initialization failed; PostgreSQL search remains available: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  get ready(): boolean {
    return Boolean(this.client && this.indexReady);
  }

  async operationalStatus() {
    if (this.client && this.initialized) {
      await this.refreshIndexReadiness();
    }
    const [outbox, backfills] = await Promise.all([
      this.dataSource.query(
        `SELECT entity_type AS "entityType",
                COUNT(*)::int AS pending,
                COUNT(*) FILTER (
                  WHERE next_attempt_at <= now()
                    AND (claimed_until IS NULL OR claimed_until < now())
                )::int AS due,
                COUNT(*) FILTER (WHERE attempts >= 5)::int AS "highAttempts",
                MAX(attempts)::int AS "maxAttempts",
                MIN(created_at) AS "oldestPendingAt"
         FROM search_index_outbox
         GROUP BY entity_type`,
      ) as Promise<
        Array<{
          entityType: "job" | "candidate";
          pending: number | string;
          due: number | string;
          highAttempts: number | string;
          maxAttempts: number | string | null;
          oldestPendingAt: Date | string | null;
        }>
      >,
      this.dataSource.query(
        `SELECT entity_type AS "entityType", completed_at AS "completedAt"
         FROM search_index_backfills
         WHERE index_name = $1 OR index_name = $2`,
        [this.index, this.candidateIndex],
      ) as Promise<
        Array<{
          entityType: "job" | "candidate";
          completedAt: Date | string | null;
        }>
      >,
    ]);
    const recentFailures = (await this.dataSource.query(
      `SELECT id, entity_type AS "entityType", entity_id AS "entityId",
              attempts, last_error AS "lastError",
              next_attempt_at AS "nextAttemptAt"
       FROM search_index_outbox
       WHERE attempts >= 5
       ORDER BY attempts DESC, created_at ASC
       LIMIT 20`,
    )) as Array<{
      id: number;
      entityType: "job" | "candidate";
      entityId: number;
      attempts: number;
      lastError: string | null;
      nextAttemptAt: Date | string;
    }>;
    const statusFor = (entityType: "job" | "candidate") => {
      const row = outbox.find((item) => item.entityType === entityType);
      const backfill = backfills.find((item) => item.entityType === entityType);
      return {
        ready:
          entityType === "job" ? this.indexReady : this.candidateIndexReady,
        backfillComplete: Boolean(backfill?.completedAt),
        pending: Number(row?.pending ?? 0),
        due: Number(row?.due ?? 0),
        highAttempts: Number(row?.highAttempts ?? 0),
        maxAttempts: Number(row?.maxAttempts ?? 0),
        oldestPendingAt: row?.oldestPendingAt
          ? new Date(row.oldestPendingAt).toISOString()
          : null,
      };
    };
    return {
      enabled: this.client !== null,
      jobs: statusFor("job"),
      candidates: statusFor("candidate"),
      recentFailures: recentFailures.map((record) => ({
        ...record,
        nextAttemptAt: new Date(record.nextAttemptAt).toISOString(),
      })),
    };
  }

  async retryIndexingRecord(
    id: number,
  ): Promise<{ entityType: "job" | "candidate" } | null> {
    return this.dataSource.transaction(async (manager) => {
      const records = (await manager.query(
        `UPDATE search_index_outbox
         SET attempts = 0,
             next_attempt_at = now(),
             last_error = NULL,
             claim_token = NULL,
             claimed_until = NULL
         WHERE id = $1
         RETURNING entity_type AS "entityType"`,
        [id],
      )) as Array<{ entityType: "job" | "candidate" }>;
      const record = records[0];
      if (!record) return null;
      await manager.query(
        `UPDATE search_index_backfills
         SET completed_at = NULL
         WHERE entity_type = $1 AND index_name = $2`,
        [
          record.entityType,
          record.entityType === "job" ? this.index : this.candidateIndex,
        ],
      );
      return { entityType: record.entityType };
    });
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
            summary: { type: "text" },
            experience: { type: "text" },
            education: { type: "text" },
            certifications: { type: "text" },
            desiredJobTitles: { type: "text" },
            resumeText: { type: "text" },
            discoverable: { type: "boolean" },
          },
        },
      },
    });
    return true;
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
           last_error = NULL,
           claim_token = NULL,
           claimed_until = NULL`;
    const parameters = [entityType, entityId, operation];
    if (manager) await manager.query(sql, parameters);
    else await this.dataSource.query(sql, parameters);
  }

  private async buildBulkActions(
    records: Array<{
      entityType: "job" | "candidate";
      entityId: number;
      operation: "upsert" | "delete";
    }>,
  ): Promise<Array<Record<string, unknown>>> {
    const jobIds = records
      .filter(
        (record) =>
          record.entityType === "job" && record.operation === "upsert",
      )
      .map((record) => record.entityId);
    const candidateIds = records
      .filter(
        (record) =>
          record.entityType === "candidate" && record.operation === "upsert",
      )
      .map((record) => record.entityId);
    const jobs = jobIds.length
      ? ((await this.dataSource.query(
          `SELECT id, title, company, location, category, industry, skills,
                  workplace_type AS "workplaceType",
                  employment_type AS "employmentType",
                  description, is_active AS "isActive",
                  application_deadline AS "applicationDeadline",
                  created_at AS "createdAt"
           FROM jobs WHERE id = ANY($1::int[])`,
          [jobIds],
        )) as Job[])
      : [];
    const candidates = candidateIds.length
      ? ((await this.dataSource.query(
          `SELECT users.id AS "candidateId",
                  users.display_name AS "displayName",
                  profile.headline,
                  profile.location,
                  profile.skills,
                  profile.summary,
                  profile.experience::text AS experience,
                  profile.education::text AS education,
                  profile.certifications::text AS certifications,
                  profile.desired_job_titles::text AS "desiredJobTitles",
                  CASE WHEN profile.allow_recruiter_resume_access
                    THEN COALESCE(current_resume.parsed_text, '')
                    ELSE ''
                  END AS "resumeText"
           FROM candidate_profiles profile
           INNER JOIN users ON users.id = profile.user_id
           LEFT JOIN candidate_resume_versions current_resume
             ON current_resume.user_id = profile.user_id
            AND current_resume.storage_path = profile.resume_path
           WHERE users.id = ANY($1::int[])
             AND profile.profile_visibility = 'recruiters'
             AND users.role = 'candidate'
             AND users.is_active = true`,
          [candidateIds],
        )) as Array<{
          candidateId: number;
          displayName: string;
          headline: string;
          location: string;
          skills: string;
          summary: string;
          experience: string;
          education: string;
          certifications: string;
          desiredJobTitles: string;
          resumeText: string;
        }>)
      : [];
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.candidateId, candidate]),
    );
    const actions: Array<Record<string, unknown>> = [];

    for (const record of records) {
      const index =
        record.entityType === "job" ? this.index : this.candidateIndex;
      if (record.operation === "delete") {
        actions.push({
          delete: { _index: index, _id: String(record.entityId) },
        });
        continue;
      }

      if (record.entityType === "job") {
        const job = jobsById.get(record.entityId);
        if (!job) {
          actions.push({
            delete: { _index: this.index, _id: String(record.entityId) },
          });
        } else {
          actions.push(
            { index: { _index: this.index, _id: String(record.entityId) } },
            {
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
          );
        }
        continue;
      }

      const candidate = candidatesById.get(record.entityId);
      if (!candidate) {
        actions.push({
          delete: { _index: this.candidateIndex, _id: String(record.entityId) },
        });
      } else {
        actions.push(
          {
            index: {
              _index: this.candidateIndex,
              _id: String(record.entityId),
            },
          },
          {
            displayName: candidate.displayName,
            headline: candidate.headline,
            location: candidate.location,
            skills: candidate.skills,
            summary: candidate.summary,
            experience: candidate.experience,
            education: candidate.education,
            certifications: candidate.certifications,
            desiredJobTitles: candidate.desiredJobTitles,
            resumeText: candidate.resumeText,
            discoverable: true,
          },
        );
      }
    }
    return actions;
  }

  private async processOutbox(): Promise<void> {
    if (!this.client || this.processingOutbox || !this.initialized) return;
    this.processingOutbox = true;
    try {
      const claimToken = randomUUID();
      const records = (await this.dataSource.query(
        `WITH due AS (
           SELECT id
           FROM search_index_outbox
           WHERE next_attempt_at <= now()
             AND (claimed_until IS NULL OR claimed_until < now())
           ORDER BY id
           LIMIT 100
           FOR UPDATE SKIP LOCKED
         )
         UPDATE search_index_outbox outbox
         SET claim_token = $1,
             claimed_until = now() + INTERVAL '1 minute'
         FROM due
         WHERE outbox.id = due.id
         RETURNING outbox.id, outbox.entity_type AS "entityType",
                   outbox.entity_id AS "entityId", outbox.operation,
                   outbox.attempts`,
        [claimToken],
      )) as Array<{
        id: number;
        entityType: "job" | "candidate";
        entityId: number;
        operation: "upsert" | "delete";
        attempts: number;
      }>;
      if (records.length) {
        const actions = await this.buildBulkActions(records);
        if (actions.length) {
          let response;
          try {
            response = await this.client.bulk({
              body: actions,
              refresh: "wait_for",
            });
          } catch (error) {
            const reason =
              error instanceof Error
                ? error.message
                : "Unknown OpenSearch bulk error";
            for (const record of records) {
              await this.retryOutboxRecord(record, claimToken, reason);
            }
            throw error;
          }
          const results = response.body.items as Array<
            Record<
              string,
              { status?: number; error?: { reason?: string; type?: string } }
            >
          >;
          if (results.length !== records.length) {
            throw new Error(
              "OpenSearch bulk response did not match its request.",
            );
          }
          const succeeded: number[] = [];
          for (const [index, result] of results.entries()) {
            const resultItem = Object.values(result)[0];
            const operation = Object.keys(result)[0];
            const isDeleteMissing =
              operation === "delete" && resultItem?.status === 404;
            if (
              resultItem?.status !== undefined &&
              (resultItem.status < 300 || isDeleteMissing)
            ) {
              succeeded.push(records[index].id);
            } else {
              const reason =
                resultItem?.error?.reason ??
                resultItem?.error?.type ??
                "Unknown OpenSearch bulk error";
              await this.retryOutboxRecord(records[index], claimToken, reason);
            }
          }
          if (succeeded.length) {
            await this.dataSource.query(
              `DELETE FROM search_index_outbox
               WHERE id = ANY($1::bigint[]) AND claim_token = $2`,
              [succeeded, claimToken],
            );
          }
        }
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

  private async retryOutboxRecord(
    record: {
      id: number;
      entityType: "job" | "candidate";
      entityId: number;
      attempts: number;
    },
    claimToken: string,
    errorMessage: string,
  ): Promise<void> {
    const attempts = record.attempts + 1;
    const retryDelay = Math.min(3_600_000, 1_000 * 2 ** Math.min(attempts, 12));
    const result = (await this.dataSource.query(
      `UPDATE search_index_outbox
       SET attempts = $3,
           next_attempt_at = now() + ($4 * interval '1 millisecond'),
           last_error = $5,
           claim_token = NULL,
           claimed_until = NULL
       WHERE id = $1 AND claim_token = $2
       RETURNING id`,
      [
        record.id,
        claimToken,
        attempts,
        retryDelay,
        errorMessage.slice(0, 1000),
      ],
    )) as Array<{ id: number }>;
    if (!result.length) return;
    await this.dataSource.query(
      `UPDATE search_index_backfills
       SET completed_at = NULL
       WHERE entity_type = $1 AND index_name = $2`,
      [
        record.entityType,
        record.entityType === "job" ? this.index : this.candidateIndex,
      ],
    );
    this.logger.warn(
      `OpenSearch ${record.entityType} indexing retry scheduled for ${record.entityId}: ${errorMessage.slice(0, 240)}`,
    );
  }

  private async runOutboxCycle(): Promise<void> {
    if (!this.initialized) {
      if (Date.now() < this.nextInitializationAttemptAt) return;
      try {
        await this.initializeIndex();
      } catch (error) {
        this.logger.warn(
          `OpenSearch initialization retry failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
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
                    fields: [
                      "displayName",
                      "headline",
                      "location",
                      "skills",
                      "summary",
                      "experience",
                      "education",
                      "certifications",
                      "desiredJobTitles",
                      "resumeText",
                    ],
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
    if (terms.some((term) => !/^[\p{L}\p{N}]{2,20}$/u.test(term))) {
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
          type: "cross_fields",
          operator: "and",
        },
      });
    }
    if (filters.location) {
      must.push({ match_phrase: { location: filters.location } });
    }
    try {
      const response = await this.client.search({
        index: this.index,
        body: {
          query: { bool: { must } },
          sort: [{ createdAt: "desc" }],
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
