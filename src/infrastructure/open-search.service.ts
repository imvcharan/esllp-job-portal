import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { Client } from "@opensearch-project/opensearch";
import { DataSource } from "typeorm";
import type { Job } from "../jobs/job.entity";

@Injectable()
export class OpenSearchService implements OnModuleInit {
  private readonly logger = new Logger(OpenSearchService.name);
  private client: Client | null = null;
  private indexReady = false;
  private initializing: Promise<void> | null = null;
  private nextInitializationAttemptAt = 0;
  private readonly index = process.env.OPENSEARCH_INDEX?.trim() || "esllp-jobs";

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
    try {
      await this.initializeIndex();
    } catch (error) {
      this.logger.warn(
        `OpenSearch initialization failed; PostgreSQL search remains available: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  get ready(): boolean {
    return Boolean(this.client && this.indexReady);
  }

  async ensureIndex(): Promise<void> {
    if (!this.client) return;
    const exists = await this.client.indices.exists({ index: this.index });
    if (exists.body) return;
    await this.client.indices.create({
      index: this.index,
      body: {
        settings: {
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
    if (!this.client || this.indexReady) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      await this.ensureIndex();
      await this.reindexAllJobs();
      this.indexReady = true;
      this.nextInitializationAttemptAt = 0;
    })();
    try {
      await this.initializing;
    } catch (error) {
      this.nextInitializationAttemptAt = Date.now() + 30_000;
      throw error;
    } finally {
      this.initializing = null;
    }
  }

  async indexJob(job: Job): Promise<void> {
    if (!this.client) return;
    await this.ensureIndex();
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

  private async reindexAllJobs(): Promise<void> {
    if (!this.client) return;
    let offset = 0;
    const batchSize = 500;
    while (true) {
      const jobs = (await this.dataSource.query(
        `SELECT id, title, company, location, category, industry, skills,
                workplace_type AS "workplaceType",
                employment_type AS "employmentType",
                description, is_active AS "isActive",
                application_deadline AS "applicationDeadline",
                created_at AS "createdAt"
         FROM jobs
         ORDER BY id
         LIMIT $1 OFFSET $2`,
        [batchSize, offset],
      )) as Job[];
      if (!jobs.length) return;
      const operations = jobs.flatMap((job) => [
        { index: { _index: this.index, _id: String(job.id) } },
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
      ]);
      const response = await this.client.bulk({
        index: this.index,
        body: operations,
        refresh: false,
      });
      if (response.body.errors) {
        this.logger.warn(
          `OpenSearch reported indexing errors at offset ${offset}.`,
        );
      }
      offset += jobs.length;
      if (jobs.length < batchSize) return;
    }
  }

  async removeJob(jobId: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.delete({ index: this.index, id: String(jobId) });
    } catch (error) {
      const status = (error as { meta?: { statusCode?: number } }).meta
        ?.statusCode;
      if (status !== 404) throw error;
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
