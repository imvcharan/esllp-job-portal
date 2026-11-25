import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, EntityManager, Repository } from "typeorm";
import { Job } from "./job.entity";
import { EmployerApprovalStatus, User, UserRole } from "../users/user.entity";
import { CreateJobDto } from "./dto/create-job.dto";
import { UpdateJobDto } from "./dto/update-job.dto";
import { CandidateProfile } from "../users/candidate-profile.entity";
import { EmailDeliveryService } from "../auth/email-delivery.service";
import {
  EmployerOrganizationMember,
  OrganizationMemberRole,
} from "../employers/organization-member.entity";
import { EmployerOrganization } from "../employers/organization.entity";
import { employerPlanLimits } from "../employers/employer-entitlements";
import { FeaturedJobPlacement } from "../employers/featured-job-placement.entity";
import { CandidateSavedSearchesService } from "../users/candidate-saved-searches.service";
import {
  currentJobDeadlineDate,
  jobPublicationError,
  normalizeJobSkills,
} from "./job.constants";
import { CandidateApplication } from "../users/candidate-application.entity";
import { CandidateSavedJob } from "../users/candidate-saved-job.entity";
import { Report, ReportTargetType } from "../reports/report.entity";
import { PlatformConfigurationService } from "../platform-config/platform-configuration.service";
import { RedisCacheService } from "../infrastructure/redis-cache.service";
import { OpenSearchService } from "../infrastructure/open-search.service";
import { CandidateFileStorageService } from "../users/candidate-file-storage.service";
import { backgroundWorkersEnabled } from "../infrastructure/process-role";
import { RazorpayConfigurationService } from "../payments/razorpay-configuration.service";
import { CreateFeaturedPlacementDto } from "./dto/create-featured-placement.dto";

type PublicJobSearchResult = {
  items: Array<Job & { featuredPlacementTypes: string[] }>;
  total: number;
  page: number;
  limit: number;
  companies: string[];
};

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private jobAlertWorker: NodeJS.Timeout | null = null;
  private jobExpiryWorker: NodeJS.Timeout | null = null;
  private processingJobAlerts = false;
  private readonly publicJobQueries = new Map<
    string,
    Promise<PublicJobSearchResult>
  >();
  private publicJobCacheGeneration = 0;

  constructor(
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(CandidateProfile)
    private readonly profilesRepository: Repository<CandidateProfile>,
    @InjectRepository(EmployerOrganizationMember)
    private readonly organizationMembers: Repository<EmployerOrganizationMember>,
    @InjectRepository(FeaturedJobPlacement)
    private readonly featuredPlacements: Repository<FeaturedJobPlacement>,
    private readonly auditService: AuditService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly savedSearchesService: CandidateSavedSearchesService,
    private readonly platformConfiguration: PlatformConfigurationService,
    private readonly razorpayConfiguration: RazorpayConfigurationService,
    @Optional()
    @Inject(RedisCacheService)
    private readonly cache: RedisCacheService | null = null,
    @Optional()
    @Inject(OpenSearchService)
    private readonly search: OpenSearchService | null = null,
    @Optional()
    @Inject(CandidateFileStorageService)
    private readonly fileStorage: CandidateFileStorageService | null = null,
  ) {}

  async onModuleInit() {
    if (!backgroundWorkersEnabled()) return;
    await this.jobsRepository.manager.query(`
      UPDATE job_alert_generation_outbox
      SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'queued' END,
          locked_at = NULL, next_attempt_at = now(), updated_at = now()
      WHERE status = 'processing'
        AND (locked_at IS NULL OR locked_at < now() - INTERVAL '2 minutes')
    `);
    this.jobAlertWorker = setInterval(() => {
      void this.processPendingJobAlerts().catch((error: unknown) => {
        this.logger.error(
          `Job alert generation worker failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      });
    }, 15_000);
    this.jobAlertWorker.unref();
    this.jobExpiryWorker = setInterval(() => {
      void this.expireDueJobs().catch((error: unknown) => {
        this.logger.error(
          `Job expiry worker failed: ${
            error instanceof Error ? error.message : "unknown database error"
          }`,
        );
      });
    }, 60_000);
    this.jobExpiryWorker.unref();
    void this.expireDueJobs().catch((error: unknown) => {
      this.logger.error(
        `Initial job expiry scan failed: ${
          error instanceof Error ? error.message : "unknown database error"
        }`,
      );
    });
  }

  onModuleDestroy() {
    if (this.jobAlertWorker) clearInterval(this.jobAlertWorker);
    if (this.jobExpiryWorker) clearInterval(this.jobExpiryWorker);
  }

  async expireDueJobs(limit = 100): Promise<number> {
    const result = await this.jobsRepository.manager.transaction(
      async (manager) => {
        const rows = (await manager.query(
          `
          WITH due_jobs AS (
            SELECT id
            FROM jobs
            WHERE is_active = true
              AND application_deadline <
                (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
            ORDER BY application_deadline ASC, id ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE jobs AS job
          SET is_active = false,
              moderation_status = 'closed',
              moderation_note = 'Closed automatically after the application deadline.'
          FROM due_jobs
          WHERE job.id = due_jobs.id
          RETURNING job.id
          `,
          [Math.max(1, Math.min(500, limit))],
        )) as Array<{ id: number }>;
        const startedPlacements = (await manager.query(
          `UPDATE featured_job_placements
           SET status = 'active', updated_at = now()
           WHERE status = 'scheduled'
             AND starts_at <= now() AND ends_at > now()
           RETURNING job_id AS "jobId", placement_type AS "placementType"`,
        )) as Array<{ jobId: number; placementType: string }>;
        for (const placement of startedPlacements) {
          if (placement.placementType === "email") {
            await this.enqueueJobAlertGeneration(
              placement.jobId,
              manager,
              true,
            );
          }
        }
        for (const { id } of rows) {
          await this.search?.enqueueJob(id, manager);
        }
        const expiredPlacements = (await manager.query(
          `UPDATE featured_job_placements
           SET status = 'expired', updated_at = now()
           WHERE status IN ('scheduled', 'active') AND ends_at <= now()
           RETURNING id`,
        )) as Array<{ id: number }>;
        return {
          expiredJobs: rows,
          placementChanges: startedPlacements.length + expiredPlacements.length,
        };
      },
    );
    if (result.expiredJobs.length || result.placementChanges)
      await this.invalidatePublicJobCache();
    return result.expiredJobs.length;
  }

  private async withFeaturedPlacementTypes(
    jobs: Job[],
  ): Promise<Array<Job & { featuredPlacementTypes: string[] }>> {
    if (!jobs.length) return [];
    const rows = (await this.jobsRepository.manager.query(
      `SELECT job_id AS "jobId", placement_type AS "placementType"
       FROM featured_job_placements
       WHERE job_id = ANY($1::integer[])
         AND status IN ('scheduled', 'active')
         AND starts_at <= now() AND ends_at > now()`,
      [jobs.map((job) => job.id)],
    )) as Array<{ jobId: number; placementType: string }>;
    const typesByJob = new Map<number, string[]>();
    for (const row of rows) {
      const types = typesByJob.get(row.jobId) ?? [];
      types.push(row.placementType);
      typesByJob.set(row.jobId, types);
    }
    return jobs.map((job) =>
      Object.assign(job, {
        featuredPlacementTypes: typesByJob.get(job.id) ?? [],
      }),
    );
  }

  async listFeaturedPlacements() {
    return this.featuredPlacements
      .createQueryBuilder("placement")
      .innerJoin(Job, "job", "job.id = placement.jobId")
      .innerJoin(
        EmployerOrganization,
        "organization",
        "organization.id = placement.organizationId",
      )
      .select("placement.id", "id")
      .addSelect("placement.jobId", "jobId")
      .addSelect("job.title", "jobTitle")
      .addSelect("placement.organizationId", "organizationId")
      .addSelect("organization.name", "organizationName")
      .addSelect("placement.placementType", "placementType")
      .addSelect("placement.startsAt", "startsAt")
      .addSelect("placement.endsAt", "endsAt")
      .addSelect("placement.status", "status")
      .addSelect("placement.paymentReference", "paymentReference")
      .orderBy("placement.createdAt", "DESC")
      .getRawMany();
  }

  async createFeaturedPlacement(
    dto: CreateFeaturedPlacementDto,
    actor: AuthenticatedUser,
  ) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt ||
      endsAt <= new Date()
    ) {
      throw new BadRequestException(
        "Choose a valid future placement window with the end after the start.",
      );
    }
    const placement = await this.jobsRepository.manager.transaction(
      async (manager) => {
        const jobs = manager.getRepository(Job);
        const observedJob = await jobs.findOneBy({ id: dto.jobId });
        if (!observedJob)
          throw new NotFoundException(`Job ${dto.jobId} was not found.`);
        if (observedJob.organizationId === null)
          throw new BadRequestException(
            "Featured placements are only available for company-owned jobs.",
          );
        const organization = await manager
          .getRepository(EmployerOrganization)
          .findOne({
            where: { id: observedJob.organizationId },
            lock: { mode: "pessimistic_write" },
          });
        if (!organization)
          throw new NotFoundException("Company workspace was not found.");
        const job = await jobs.findOne({
          where: { id: dto.jobId },
          lock: { mode: "pessimistic_write" },
        });
        if (!job || job.organizationId !== organization.id)
          throw new ConflictException(
            "The job’s company changed. Reload and try again.",
          );
        if (
          !job.isActive ||
          (job.applicationDeadline &&
            job.applicationDeadline < currentJobDeadlineDate())
        ) {
          throw new BadRequestException(
            "Only currently published jobs can be featured.",
          );
        }
        const overlapping = await manager.query(
          `SELECT id
           FROM featured_job_placements
           WHERE job_id = $1 AND placement_type = $2
             AND status IN ('scheduled', 'active')
             AND starts_at < $4 AND ends_at > $3
           LIMIT 1`,
          [job.id, dto.placementType, startsAt, endsAt],
        );
        if (overlapping.length) {
          throw new ConflictException(
            "This job already has an overlapping placement of that type.",
          );
        }
        const saved = await manager.getRepository(FeaturedJobPlacement).save({
          jobId: job.id,
          organizationId: organization.id,
          placementType: dto.placementType,
          startsAt,
          endsAt,
          status: startsAt > new Date() ? "scheduled" : "active",
          paymentReference: dto.paymentReference?.trim() || null,
        });
        if (saved.placementType === "email" && saved.status === "active") {
          await this.enqueueJobAlertGeneration(saved.jobId, manager, true);
        }
        return saved;
      },
    );
    await this.auditService.record({
      actorUserId: actor.id,
      action: "admin.featured_job_placement_created",
      targetType: "featured_job_placement",
      targetId: placement.id,
      details: {
        jobId: placement.jobId,
        organizationId: placement.organizationId,
        placementType: placement.placementType,
        paymentReference: placement.paymentReference,
      },
    });
    await this.invalidatePublicJobCache();
    return placement;
  }

  async cancelFeaturedPlacement(placementId: number, actor: AuthenticatedUser) {
    const placement = await this.featuredPlacements.findOneBy({
      id: placementId,
    });
    if (!placement)
      throw new NotFoundException("Featured placement was not found.");
    if (!["scheduled", "active"].includes(placement.status))
      throw new ConflictException(
        "Only scheduled or active featured placements can be cancelled.",
      );
    placement.status = "cancelled";
    const saved = await this.featuredPlacements.save(placement);
    await this.auditService.record({
      actorUserId: actor.id,
      action: "admin.featured_job_placement_cancelled",
      targetType: "featured_job_placement",
      targetId: saved.id,
      details: { jobId: saved.jobId, organizationId: saved.organizationId },
    });
    await this.invalidatePublicJobCache();
    return saved;
  }

  jobOptions() {
    return this.platformConfiguration.jobOptions();
  }

  async findAll(filters: {
    query?: string;
    location?: string;
    page?: number;
    limit?: number;
    workplaceType?: string;
    employmentType?: string;
    experience?: string;
    company?: string;
    category?: string;
    industry?: string;
    minimumSalary?: number;
    salaryCurrency?: string;
    salaryPeriod?: string;
    freshnessDays?: number;
    sort?: string;
    skill?: string;
  }): Promise<PublicJobSearchResult> {
    this.validateSearchFilters(filters);
    const page = Math.min(1_000_000, Math.max(1, filters.page ?? 1));
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const cacheGeneration = this.publicJobCacheGeneration;
    const cacheKey = `public-jobs:${cacheGeneration}:${Buffer.from(JSON.stringify({ ...filters, page, limit })).toString("base64url")}`;
    const cached = await this.cache?.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        this.logger.warn("Ignoring malformed public job cache entry.");
      }
    }
    const inFlight = this.publicJobQueries.get(cacheKey);
    if (inFlight) return inFlight;

    const load = this.loadPublicJobResults(filters, page, limit).then(
      async (response) => {
        if (cacheGeneration === this.publicJobCacheGeneration) {
          await this.cache?.set(cacheKey, JSON.stringify(response), 30);
        }
        return response;
      },
    );
    this.publicJobQueries.set(cacheKey, load);
    try {
      return await load;
    } finally {
      if (this.publicJobQueries.get(cacheKey) === load) {
        this.publicJobQueries.delete(cacheKey);
      }
    }
  }

  private async loadPublicJobResults(
    filters: {
      query?: string;
      location?: string;
      page?: number;
      limit?: number;
      workplaceType?: string;
      employmentType?: string;
      experience?: string;
      company?: string;
      category?: string;
      industry?: string;
      minimumSalary?: number;
      salaryCurrency?: string;
      salaryPeriod?: string;
      freshnessDays?: number;
      sort?: string;
      skill?: string;
    },
    page: number,
    limit: number,
  ): Promise<PublicJobSearchResult> {
    const searchIds =
      filters.query || filters.location
        ? ((await this.search?.searchIds({
            query: filters.query,
            location: filters.location,
          })) ?? null)
        : null;
    const queryBuilder = this.jobsRepository
      .createQueryBuilder("job")
      .where("job.isActive = :isActive", { isActive: true })
      .andWhere(
        "(job.applicationDeadline IS NULL OR job.applicationDeadline >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)",
      )
      .take(limit)
      .skip((page - 1) * limit);

    if (searchIds?.length) {
      queryBuilder.andWhere("job.id IN (:...searchIds)", { searchIds });
    }

    const queryTerms = filters.query?.trim().split(/\s+/).filter(Boolean) ?? [];
    for (const [index, term] of queryTerms.entries()) {
      const parameter = `queryTerm${index}`;
      const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
      queryBuilder.andWhere(
        new Brackets((where) => {
          where
            .where(`job.title ILIKE :${parameter} ESCAPE '\\'`, {
              [parameter]: pattern,
            })
            .orWhere(`job.company ILIKE :${parameter} ESCAPE '\\'`, {
              [parameter]: pattern,
            })
            .orWhere(`job.description ILIKE :${parameter} ESCAPE '\\'`, {
              [parameter]: pattern,
            })
            .orWhere(
              `EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(job.skills) AS job_skill(skill)
                WHERE job_skill.skill ILIKE :${parameter} ESCAPE '\\'
              )`,
              { [parameter]: pattern },
            );
        }),
      );
    }

    const location = filters.location?.trim();
    if (location) {
      queryBuilder.andWhere("job.location ILIKE :location ESCAPE '\\'", {
        location: `%${location.replace(/[\\%_]/g, "\\$&")}%`,
      });
    }

    if (filters.skill !== undefined && typeof filters.skill !== "string") {
      throw new BadRequestException("Skill filters must be text.");
    }
    const skill = filters.skill?.trim();
    if (skill) {
      if (skill.length > 60) {
        throw new BadRequestException(
          "Skill filters must be 60 characters or fewer.",
        );
      }
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(job.skills) AS job_skill(skill)
          WHERE job_skill.skill ILIKE :skill
        )`,
        { skill: `%${skill.replace(/[\\%_]/g, "\\$&")}%` },
      );
    }

    if (filters.workplaceType) {
      queryBuilder.andWhere("job.workplaceType = :workplaceType", {
        workplaceType: filters.workplaceType,
      });
    }
    if (filters.employmentType) {
      queryBuilder.andWhere("job.employmentType = :employmentType", {
        employmentType: filters.employmentType,
      });
    }
    if (filters.company) {
      queryBuilder.andWhere("job.company = :company", {
        company: filters.company,
      });
    }
    if (filters.category) {
      queryBuilder.andWhere("job.category = :category", {
        category: filters.category,
      });
    }
    if (filters.industry) {
      queryBuilder.andWhere("job.industry = :industry", {
        industry: filters.industry,
      });
    }
    if (filters.minimumSalary && filters.minimumSalary > 0) {
      queryBuilder
        .andWhere("job.salaryMin >= :minimumSalary", {
          minimumSalary: filters.minimumSalary,
        })
        .andWhere("job.salaryCurrency = :salaryCurrency", {
          salaryCurrency: filters.salaryCurrency ?? "INR",
        })
        .andWhere("job.salaryPeriod = :salaryPeriod", {
          salaryPeriod: filters.salaryPeriod ?? "year",
        });
    } else {
      if (filters.salaryCurrency) {
        queryBuilder.andWhere("job.salaryCurrency = :salaryCurrency", {
          salaryCurrency: filters.salaryCurrency,
        });
      }
      if (filters.salaryPeriod) {
        queryBuilder.andWhere("job.salaryPeriod = :salaryPeriod", {
          salaryPeriod: filters.salaryPeriod,
        });
      }
    }
    if (filters.freshnessDays && filters.freshnessDays > 0) {
      queryBuilder.andWhere(
        "job.createdAt >= NOW() - (:freshnessDays * INTERVAL '1 day')",
        { freshnessDays: filters.freshnessDays },
      );
    }
    if (filters.experience === "early") {
      queryBuilder.andWhere(
        "(substring(job.experience from '\\d+'))::int <= 2",
      );
    } else if (filters.experience === "mid") {
      queryBuilder
        .andWhere("(substring(job.experience from '\\d+'))::int <= 5")
        .andWhere(
          "COALESCE((substring(job.experience from '\\d+\\D+(\\d+)'))::int, CASE WHEN job.experience ILIKE '%+%' THEN 2147483647 ELSE (substring(job.experience from '\\d+'))::int END) >= 3",
        );
    } else if (filters.experience === "senior") {
      queryBuilder.andWhere(
        "COALESCE((substring(job.experience from '\\d+\\D+(\\d+)'))::int, CASE WHEN job.experience ILIKE '%+%' THEN 2147483647 ELSE (substring(job.experience from '\\d+'))::int END) >= 5",
      );
    }

    const featuredOrdering = `EXISTS (
      SELECT 1 FROM featured_job_placements placement
      WHERE placement.job_id = job.id
        AND placement.placement_type IN ('homepage', 'search')
        AND placement.status IN ('scheduled', 'active')
        AND placement.starts_at <= now() AND placement.ends_at > now()
    )`;
    const searchPosition = searchIds?.length
      ? `array_position(ARRAY[${searchIds.join(",")}]::integer[], job.id)`
      : null;
    if (filters.sort === "salary") {
      queryBuilder
        .orderBy(featuredOrdering, "DESC")
        .addOrderBy("job.salaryCurrency", "ASC")
        .addOrderBy("job.salaryPeriod", "ASC")
        .addOrderBy(
          "COALESCE(job.salaryMax, job.salaryMin)",
          "DESC",
          "NULLS LAST",
        )
        .addOrderBy("job.createdAt", "DESC");
      if (searchPosition) queryBuilder.addOrderBy(searchPosition, "ASC");
    } else if (filters.sort === "title") {
      queryBuilder
        .orderBy(featuredOrdering, "DESC")
        .addOrderBy("job.title", "ASC")
        .addOrderBy("job.createdAt", "DESC");
      if (searchPosition) queryBuilder.addOrderBy(searchPosition, "ASC");
    } else {
      queryBuilder.orderBy(featuredOrdering, "DESC");
      if (searchPosition) queryBuilder.addOrderBy(searchPosition, "ASC");
      queryBuilder.addOrderBy("job.createdAt", "DESC");
    }

    const [items, total] = await queryBuilder.getManyAndCount();
    const itemsWithPlacements = await this.withFeaturedPlacementTypes(items);
    const companies = await this.jobsRepository
      .createQueryBuilder("job")
      .select("DISTINCT job.company", "company")
      .where("job.isActive = :isActive", { isActive: true })
      .andWhere(
        "(job.applicationDeadline IS NULL OR job.applicationDeadline >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)",
      )
      .orderBy("job.company", "ASC")
      .getRawMany<{ company: string }>();
    const response = {
      items: itemsWithPlacements,
      total,
      page,
      limit,
      companies: companies.map(({ company }) => company),
    };
    return response;
  }

  private validateSearchFilters(filters: {
    query?: string;
    location?: string;
    workplaceType?: string;
    employmentType?: string;
    experience?: string;
    company?: string;
    category?: string;
    industry?: string;
    salaryCurrency?: string;
    salaryPeriod?: string;
    sort?: string;
    skill?: string;
    minimumSalary?: number;
    freshnessDays?: number;
  }): void {
    const limits: Array<[string, unknown, number]> = [
      ["Search text", filters.query, 120],
      ["Location", filters.location, 120],
      ["Workplace type", filters.workplaceType, 80],
      ["Employment type", filters.employmentType, 80],
      ["Experience", filters.experience, 40],
      ["Company", filters.company, 120],
      ["Category", filters.category, 120],
      ["Industry", filters.industry, 120],
      ["Salary currency", filters.salaryCurrency, 3],
      ["Salary period", filters.salaryPeriod, 20],
      ["Sort", filters.sort, 20],
      ["Skill", filters.skill, 60],
    ];
    for (const [label, value, maxLength] of limits) {
      if (value !== undefined && typeof value !== "string") {
        throw new BadRequestException(`${label} filters must be text.`);
      }
      if (typeof value === "string" && value.length > maxLength) {
        throw new BadRequestException(
          `${label} filters must be ${maxLength} characters or fewer.`,
        );
      }
    }
    if (
      filters.minimumSalary !== undefined &&
      (!Number.isSafeInteger(filters.minimumSalary) ||
        filters.minimumSalary < 0 ||
        filters.minimumSalary > 2_000_000_000)
    ) {
      throw new BadRequestException(
        "Minimum salary is outside the supported range.",
      );
    }
    if (
      filters.freshnessDays !== undefined &&
      (!Number.isSafeInteger(filters.freshnessDays) ||
        filters.freshnessDays < 0 ||
        filters.freshnessDays > 3_650)
    ) {
      throw new BadRequestException(
        "Freshness must be between 0 and 3650 days.",
      );
    }
  }

  async syncSearchIndex(job: Job, manager?: EntityManager): Promise<void> {
    await this.search?.enqueueJob(job.id, manager);
    await this.invalidatePublicJobCache();
  }

  private async invalidatePublicJobCache(): Promise<void> {
    this.publicJobCacheGeneration += 1;
    await this.cache?.deleteByPrefix("public-jobs:");
  }

  async findAllForAdministration(): Promise<Array<Job & { expired: boolean }>> {
    const jobs = await this.jobsRepository.find({
      order: { createdAt: "DESC" },
    });
    const today = currentJobDeadlineDate();
    return jobs.map((job) => ({
      ...job,
      expired: Boolean(
        job.applicationDeadline && job.applicationDeadline < today,
      ),
    }));
  }

  async create(
    dto: CreateJobDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<
    Job & { notificationDelivery?: { queued: number; failed: number } }
  > {
    const workplaceType = dto.workplaceType?.trim() || "onsite";
    const employmentType = dto.employmentType?.trim() || "full-time";
    await Promise.all([
      this.platformConfiguration.assertTaxonomyValue(
        "jobCategories",
        dto.category,
      ),
      this.platformConfiguration.assertTaxonomyValue(
        "industries",
        dto.industry,
      ),
      this.platformConfiguration.assertTaxonomyValue(
        "employmentTypes",
        employmentType,
      ),
      this.platformConfiguration.assertTaxonomyValue(
        "workplaceTypes",
        workplaceType,
      ),
    ]);
    this.assertDeadlineAllowsPublishing(dto.isActive, dto.applicationDeadline);
    if (dto.isActive) {
      const readinessError = jobPublicationError(dto);
      if (readinessError) throw new BadRequestException(readinessError);
    }
    const employerOrganizationId = await this.getEmployerOrganizationId(
      dto.employerUserId,
    );
    const salaryMin = dto.salaryMin ?? null;
    const salaryMax = dto.salaryMax ?? null;
    if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
      throw new BadRequestException(
        "Minimum salary cannot exceed maximum salary",
      );
    }
    const job = await this.jobsRepository.manager.transaction(
      async (manager) => {
        if (dto.isActive && employerOrganizationId !== null) {
          await this.assertOrganizationJobQuota(
            manager,
            employerOrganizationId,
          );
        }
        const saved = await manager.getRepository(Job).save(
          manager.getRepository(Job).create({
            ...dto,
            title: dto.title.trim(),
            company: dto.company.trim(),
            location: dto.location.trim(),
            category: dto.category?.trim() || null,
            industry: dto.industry?.trim() || null,
            skills: normalizeJobSkills(dto.skills),
            workplaceType,
            employmentType,
            salaryMin,
            salaryMax,
            salaryCurrency: dto.salaryCurrency ?? "INR",
            salaryPeriod: dto.salaryPeriod ?? "year",
            applicationDeadline: dto.applicationDeadline ?? null,
            numberOfOpenings: dto.numberOfOpenings ?? 1,
            experience: dto.experience?.trim() || null,
            description: dto.description?.trim() || null,
            isActive: dto.isActive ?? false,
            moderationStatus: dto.isActive ? "approved" : "draft",
            moderationNote: null,
            organizationId: employerOrganizationId,
          }),
        );
        await this.search?.enqueueJob(saved.id, manager);
        if (saved.isActive)
          await this.enqueueJobAlertGeneration(saved.id, manager);
        return saved;
      },
    );
    await this.invalidatePublicJobCache();
    await this.auditService.record({
      actorUserId: actor.id,
      action: "job.created",
      targetType: "job",
      targetId: job.id,
      details: {
        title: job.title,
        isActive: job.isActive,
        employerUserId: job.employerUserId,
      },
      ipAddress,
    });
    if (!job.isActive) return job;
    const notificationDelivery = await this.processJobAlert(job.id);
    return Object.assign(job, { notificationDelivery });
  }

  async update(
    id: number,
    dto: UpdateJobDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<
    (Job & { notificationDelivery?: { queued: number; failed: number } }) | null
  > {
    const job = await this.jobsRepository.findOneBy({ id });
    if (!job) {
      return null;
    }
    if (dto.workplaceType !== undefined && !dto.workplaceType.trim())
      throw new BadRequestException("Choose a workplace type.");
    if (dto.employmentType !== undefined && !dto.employmentType.trim())
      throw new BadRequestException("Choose an employment type.");
    await Promise.all([
      ...(dto.category !== undefined && dto.category !== job.category
        ? [
            this.platformConfiguration.assertTaxonomyValue(
              "jobCategories",
              dto.category,
            ),
          ]
        : []),
      ...(dto.industry !== undefined && dto.industry !== job.industry
        ? [
            this.platformConfiguration.assertTaxonomyValue(
              "industries",
              dto.industry,
            ),
          ]
        : []),
      ...(dto.employmentType !== undefined &&
      dto.employmentType !== job.employmentType
        ? [
            this.platformConfiguration.assertTaxonomyValue(
              "employmentTypes",
              dto.employmentType,
            ),
          ]
        : []),
      ...(dto.workplaceType !== undefined &&
      dto.workplaceType !== job.workplaceType
        ? [
            this.platformConfiguration.assertTaxonomyValue(
              "workplaceTypes",
              dto.workplaceType,
            ),
          ]
        : []),
    ]);
    const wasActive = job.isActive;
    const previousOrganizationId = job.organizationId;
    if (dto.employerUserId !== undefined) {
      job.organizationId = await this.getEmployerOrganizationId(
        dto.employerUserId,
      );
    }
    const nextDeadline =
      dto.applicationDeadline === undefined
        ? job.applicationDeadline
        : dto.applicationDeadline;
    this.assertDeadlineAllowsPublishing(dto.isActive, nextDeadline);
    if (
      (dto.isActive === true && !wasActive) ||
      (wasActive &&
        (dto.title !== undefined ||
          dto.location !== undefined ||
          dto.description !== undefined))
    ) {
      const readinessError = jobPublicationError({
        title: dto.title ?? job.title,
        location: dto.location ?? job.location,
        description: dto.description ?? job.description,
      });
      if (readinessError) throw new BadRequestException(readinessError);
    }
    const salaryMin =
      dto.salaryMin === undefined ? job.salaryMin : dto.salaryMin;
    const salaryMax =
      dto.salaryMax === undefined ? job.salaryMax : dto.salaryMax;
    if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
      throw new BadRequestException(
        "Minimum salary cannot exceed maximum salary",
      );
    }

    Object.assign(job, dto);
    if (dto.skills !== undefined) {
      job.skills = normalizeJobSkills(dto.skills);
    }
    if (dto.isActive !== undefined)
      job.moderationStatus = dto.isActive ? "approved" : "closed";
    if (dto.title !== undefined) job.title = dto.title.trim();
    if (dto.company !== undefined) job.company = dto.company.trim();
    if (dto.location !== undefined) job.location = dto.location.trim();
    if (dto.category !== undefined) job.category = dto.category?.trim() || null;
    if (dto.industry !== undefined) job.industry = dto.industry?.trim() || null;
    if (dto.experience !== undefined)
      job.experience = dto.experience?.trim() || null;
    if (dto.description !== undefined)
      job.description = dto.description?.trim() || null;
    const saved = await this.jobsRepository.manager.transaction(
      async (manager) => {
        const activatesInOrganization =
          job.isActive &&
          (!wasActive || job.organizationId !== previousOrganizationId);
        if (activatesInOrganization && job.organizationId != null) {
          await this.assertOrganizationJobQuota(manager, job.organizationId);
        }
        const updated = await manager.getRepository(Job).save(job);
        await this.search?.enqueueJob(updated.id, manager);
        if (dto.isActive === true && !wasActive)
          await this.enqueueJobAlertGeneration(updated.id, manager);
        return updated;
      },
    );
    await this.invalidatePublicJobCache();
    await this.auditService.record({
      actorUserId: actor.id,
      action: "job.updated",
      targetType: "job",
      targetId: saved.id,
      details: {
        title: saved.title,
        isActive: saved.isActive,
        employerUserId: saved.employerUserId,
      },
      ipAddress,
    });
    if (dto.isActive !== true || wasActive) return saved;
    const notificationDelivery = await this.processJobAlert(saved.id);
    return Object.assign(saved, { notificationDelivery });
  }

  async archive(
    id: number,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<Job | null> {
    const job = await this.jobsRepository.findOneBy({ id });
    if (!job) {
      return null;
    }
    job.isActive = false;
    job.moderationStatus = "closed";
    const archived = await this.jobsRepository.manager.transaction(
      async (manager) => {
        const updated = await manager.getRepository(Job).save(job);
        await this.search?.enqueueJob(updated.id, manager);
        return updated;
      },
    );
    await this.invalidatePublicJobCache();
    await this.auditService.record({
      actorUserId: actor.id,
      action: "job.archived",
      targetType: "job",
      targetId: archived.id,
      details: { title: archived.title },
      ipAddress,
    });
    return archived;
  }

  async moderate(
    id: number,
    status: "approved" | "rejected" | "paused",
    reason: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { saved, wasActive, previousStatus } =
      await this.jobsRepository.manager.transaction(async (manager) => {
        const jobs = manager.getRepository(Job);
        const observedJob = await jobs.findOneBy({ id });
        if (!observedJob)
          throw new NotFoundException(`Job ${id} was not found`);
        if (status === "approved" && observedJob.organizationId != null) {
          await this.assertOrganizationJobQuota(
            manager,
            observedJob.organizationId,
            id,
          );
        }
        const job = await jobs.findOne({
          where: { id },
          lock: { mode: "pessimistic_write" },
        });
        if (!job) throw new NotFoundException(`Job ${id} was not found`);
        if (job.organizationId !== observedJob.organizationId) {
          throw new ConflictException(
            "The job’s company changed during moderation. Reload and try again.",
          );
        }
        const previousStatus = job.moderationStatus;
        const wasActive = job.isActive;
        job.moderationStatus = status;
        job.moderationNote = reason.trim();
        job.isActive = status === "approved";
        if (job.isActive) {
          const readinessError = jobPublicationError(job);
          if (readinessError) throw new BadRequestException(readinessError);
          this.assertDeadlineAllowsPublishing(
            job.isActive,
            job.applicationDeadline,
          );
        }
        const updated = await jobs.save(job);
        await this.search?.enqueueJob(updated.id, manager);
        if (status === "approved" && !wasActive)
          await this.enqueueJobAlertGeneration(updated.id, manager);
        return { saved: updated, wasActive, previousStatus };
      });
    await this.invalidatePublicJobCache();
    await this.auditService.record({
      actorUserId: actor.id,
      action: `job.moderation_${status}`,
      targetType: "job",
      targetId: saved.id,
      details: {
        previousStatus,
        status,
        reason: saved.moderationNote,
      },
      ipAddress,
    });
    const notificationDelivery =
      status === "approved" && !wasActive
        ? await this.processJobAlert(saved.id)
        : undefined;
    return { ...saved, notificationDelivery };
  }

  async permanentlyDelete(
    id: number,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<{ success: true }> {
    const deletedJob = await this.jobsRepository.manager.transaction(
      async (manager) => {
        const jobs = manager.getRepository(Job);
        const job = await jobs.findOne({
          where: { id },
          lock: { mode: "pessimistic_write" },
        });
        if (!job) {
          throw new NotFoundException(`Job ${id} was not found`);
        }
        const [applications, savedJobs, reports] = await Promise.all([
          manager.getRepository(CandidateApplication).countBy({ jobId: id }),
          manager.getRepository(CandidateSavedJob).countBy({ jobId: id }),
          manager.getRepository(Report).countBy({
            targetType: ReportTargetType.JOB,
            targetId: id,
          }),
        ]);
        if (applications || savedJobs || reports) {
          throw new ConflictException(
            "This job has linked applications, saved-job records, or reports and cannot be permanently deleted. Archive it instead to preserve history.",
          );
        }
        const deletedJob = { title: job.title };
        const pendingDocuments = (await manager.query(
          `SELECT file_path AS path
           FROM candidate_application_documents
           WHERE job_id = $1 AND application_id IS NULL`,
          [id],
        )) as Array<{ path: string }>;
        await this.fileStorage?.enqueueCleanup(
          pendingDocuments.map(({ path }) => path),
          manager,
        );
        await this.auditService.record(
          {
            actorUserId: actor.id,
            action: "job.permanently_deleted",
            targetType: "job",
            targetId: id,
            details: deletedJob,
            ipAddress,
          },
          manager,
        );
        await jobs.delete(id);
        await this.search?.removeJob(id, manager);
        return deletedJob;
      },
    );
    await this.invalidatePublicJobCache();
    return { success: true };
  }

  findOne(id: number): Promise<Job | null> {
    return this.jobsRepository
      .createQueryBuilder("job")
      .where("job.id = :id", { id })
      .andWhere("job.isActive = :isActive", { isActive: true })
      .andWhere(
        "(job.applicationDeadline IS NULL OR job.applicationDeadline >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)",
      )
      .getOne();
  }

  private async getEmployerOrganizationId(
    employerUserId: number | null | undefined,
  ): Promise<number | null> {
    if (employerUserId == null) return null;
    const employer = await this.usersRepository.findOneBy({
      id: employerUserId,
      role: UserRole.EMPLOYER,
      isActive: true,
      employerApprovalStatus: EmployerApprovalStatus.APPROVED,
    });
    if (!employer) {
      throw new BadRequestException(
        "Assigned job owner must be an active employer account.",
      );
    }

    const ownerMembership = await this.organizationMembers.findOne({
      where: {
        userId: employer.id,
        role: OrganizationMemberRole.OWNER,
        status: "active",
      },
      order: { createdAt: "ASC" },
    });
    if (!ownerMembership) {
      throw new BadRequestException(
        "The employer account has no active company workspace.",
      );
    }
    return ownerMembership.organizationId;
  }

  private assertDeadlineAllowsPublishing(
    isActive: boolean | undefined,
    applicationDeadline: string | null | undefined,
  ): void {
    if (
      isActive === true &&
      applicationDeadline &&
      applicationDeadline < currentJobDeadlineDate()
    ) {
      throw new BadRequestException(
        "A job with a past application deadline cannot be published.",
      );
    }
  }

  private async assertOrganizationJobQuota(
    manager: EntityManager,
    organizationId: number,
    excludedJobId?: number,
  ) {
    const organizations = manager.getRepository(EmployerOrganization);
    const organization = await organizations.findOne({
      where: { id: organizationId },
      lock: { mode: "pessimistic_write" },
    });
    if (!organization) {
      throw new ConflictException(
        "The company workspace no longer exists; job activation was cancelled.",
      );
    }
    const limits = await employerPlanLimits(
      organization,
      this.razorpayConfiguration,
    );
    const jobs = manager.getRepository(Job);
    const activeQuery = jobs
      .createQueryBuilder("job")
      .where("job.organizationId = :organizationId", { organizationId })
      .andWhere("job.isActive = true");
    if (excludedJobId !== undefined) {
      activeQuery.andWhere("job.id != :excludedJobId", { excludedJobId });
    }
    const activeJobs = await activeQuery.getCount();
    if (activeJobs >= limits.activeJobs) {
      throw new ConflictException(
        `This company’s plan allows ${limits.activeJobs} active job(s). Close a job or upgrade the plan before activating this listing.`,
      );
    }
  }

  async enqueueJobAlertGeneration(
    jobId: number,
    manager: EntityManager,
    restartCompleted = false,
  ) {
    await manager.query(
      `INSERT INTO job_alert_generation_outbox (job_id)
       VALUES ($1)
       ON CONFLICT (job_id) DO UPDATE
       SET status = 'queued', attempts = 0, next_attempt_at = now(),
           locked_at = NULL, last_error = NULL, updated_at = now()
       WHERE $2::boolean AND job_alert_generation_outbox.status IN ('completed', 'failed')`,
      [jobId, restartCompleted],
    );
  }

  async processPendingJobAlerts(limit = 10) {
    if (this.processingJobAlerts) return 0;
    this.processingJobAlerts = true;
    try {
      const due = (await this.jobsRepository.manager.transaction((manager) =>
        manager.query(
          `SELECT job_id AS "jobId"
           FROM job_alert_generation_outbox
           WHERE status = 'queued' AND next_attempt_at <= now()
           ORDER BY next_attempt_at, job_id
           LIMIT $1`,
          [Math.min(50, Math.max(1, limit))],
        ),
      )) as Array<{ jobId: number }>;
      for (const item of due) await this.processJobAlert(item.jobId);
      return due.length;
    } finally {
      this.processingJobAlerts = false;
    }
  }

  async jobAlertOperationalStatus() {
    const [rows, failed] = await Promise.all([
      this.jobsRepository.manager.query(`
        SELECT status, COUNT(*)::int AS count,
               COUNT(*) FILTER (
                 WHERE status = 'queued' AND next_attempt_at <= now()
               )::int AS due,
               MIN(created_at) FILTER (WHERE status = 'queued') AS "oldestQueuedAt"
        FROM job_alert_generation_outbox
        GROUP BY status
      `) as Promise<
        Array<{
          status: string;
          count: number | string;
          due: number | string;
          oldestQueuedAt: Date | null;
        }>
      >,
      this.jobsRepository.manager.query(`
        SELECT outbox.job_id AS "jobId", job.title,
               outbox.attempts, outbox.last_error AS "lastError",
               outbox.updated_at AS "updatedAt"
        FROM job_alert_generation_outbox outbox
        INNER JOIN jobs job ON job.id = outbox.job_id
        WHERE outbox.status = 'failed'
        ORDER BY outbox.updated_at DESC
        LIMIT 50
      `) as Promise<
        Array<{
          jobId: number;
          title: string;
          attempts: number;
          lastError: string | null;
          updatedAt: Date;
        }>
      >,
    ]);
    return {
      counts: Object.fromEntries(
        rows.map(({ status, count }) => [status, Number(count)]),
      ),
      due: rows.reduce((total, row) => total + Number(row.due), 0),
      oldestQueuedAt:
        rows.find((row) => row.oldestQueuedAt)?.oldestQueuedAt?.toISOString() ??
        null,
      failed,
    };
  }

  async retryFailedJobAlert(jobId: number) {
    const result = (await this.jobsRepository.manager.query(
      `UPDATE job_alert_generation_outbox
       SET status = 'queued', attempts = 0, next_attempt_at = now(),
           locked_at = NULL, last_error = NULL, updated_at = now()
       WHERE job_id = $1 AND status = 'failed'
       RETURNING job_id AS "jobId"`,
      [jobId],
    )) as Array<{ jobId: number }>;
    return result.length > 0;
  }

  async processJobAlert(jobId: number) {
    const claimed = (await this.jobsRepository.manager.transaction((manager) =>
      manager.query(
        `UPDATE job_alert_generation_outbox
         SET status = 'processing', attempts = attempts + 1,
             locked_at = now(), updated_at = now()
         WHERE job_id = $1 AND status = 'queued'
           AND next_attempt_at <= now()
         RETURNING attempts`,
        [jobId],
      ),
    )) as Array<{ attempts: number }>;
    if (!claimed.length) return { queued: 0, failed: 0 };
    const attempts = Number(claimed[0].attempts);
    try {
      const job = await this.jobsRepository.findOneBy({
        id: jobId,
        isActive: true,
      });
      if (!job) {
        await this.jobsRepository.manager.query(
          `UPDATE job_alert_generation_outbox
           SET status = 'completed', locked_at = NULL, last_error = NULL,
               updated_at = now()
           WHERE job_id = $1 AND status = 'processing'`,
          [jobId],
        );
        return { queued: 0, failed: 0 };
      }
      const result = await this.notifyMatchingCandidates(job);
      const failed = result.failed > 0;
      const delaySeconds = Math.min(21_600, 60 * 2 ** (attempts - 1));
      await this.jobsRepository.manager.query(
        `UPDATE job_alert_generation_outbox
         SET status = $2, locked_at = NULL,
             next_attempt_at = CASE WHEN $2 = 'queued'
               THEN now() + ($3 * INTERVAL '1 second')
               ELSE next_attempt_at END,
             last_error = $4, updated_at = now()
         WHERE job_id = $1 AND status = 'processing'`,
        [
          jobId,
          failed && attempts < 5 ? "queued" : failed ? "failed" : "completed",
          delaySeconds,
          failed ? "One or more matching alerts could not be generated." : null,
        ],
      );
      return result;
    } catch (error) {
      const lastError =
        error instanceof Error ? error.message.slice(0, 1000) : "Unknown error";
      await this.jobsRepository.manager.query(
        `UPDATE job_alert_generation_outbox
         SET status = $2, locked_at = NULL,
             next_attempt_at = CASE WHEN $2 = 'queued'
               THEN now() + ($3 * INTERVAL '1 second')
               ELSE next_attempt_at END,
             last_error = $4, updated_at = now()
         WHERE job_id = $1 AND status = 'processing'`,
        [
          jobId,
          attempts < 5 ? "queued" : "failed",
          Math.min(21_600, 60 * 2 ** (attempts - 1)),
          lastError,
        ],
      );
      throw error;
    }
  }

  async notifyMatchingCandidates(job: Job) {
    try {
      const emailPlacementRows = (await this.jobsRepository.manager.query(
        `SELECT id AS "placementId"
         FROM featured_job_placements
         WHERE job_id = $1 AND placement_type = 'email'
           AND status IN ('scheduled', 'active')
           AND starts_at <= now() AND ends_at > now()
         ORDER BY starts_at DESC, id DESC
         LIMIT 1`,
        [job.id],
      )) as Array<{ placementId: number }>;
      const featuredPlacementId = emailPlacementRows[0]?.placementId;
      const emailFeatured = featuredPlacementId !== undefined;
      const profiles = await this.profilesRepository.findBy({
        jobAlertEmails: true,
      });
      const matchingProfiles = profiles.filter((profile) => {
        const roleMatches = profile.desiredJobTitles.some((title) => {
          const candidateTitle = title.toLocaleLowerCase();
          const jobTitle = job.title.toLocaleLowerCase();
          return (
            candidateTitle.includes(jobTitle) ||
            jobTitle.includes(candidateTitle)
          );
        });
        const workplaceMatches =
          !profile.workplaceTypes.length ||
          profile.workplaceTypes.includes(job.workplaceType);
        const employmentMatches =
          !profile.employmentTypes.length ||
          profile.employmentTypes.includes(job.employmentType);
        const preferredLocations = profile.location
          .split(/[,;|]/)
          .map((value) => value.trim().toLocaleLowerCase())
          .filter(Boolean);
        const jobLocation = job.location.toLocaleLowerCase();
        const locationMatches =
          !preferredLocations.length ||
          preferredLocations.some(
            (preferred) =>
              jobLocation.includes(preferred) ||
              (preferred.includes("remote") && job.workplaceType === "remote"),
          );
        const salary = profile.salaryPreferences;
        const salaryMatches =
          !salary.minimum ||
          (job.salaryMin !== null &&
            job.salaryMin >= salary.minimum &&
            (!salary.currency || salary.currency === job.salaryCurrency) &&
            (!salary.period || salary.period === job.salaryPeriod));
        return (
          roleMatches &&
          workplaceMatches &&
          employmentMatches &&
          locationMatches &&
          salaryMatches
        );
      });
      let savedSearches: Awaited<
        ReturnType<CandidateSavedSearchesService["matchingForJob"]>
      > = [];
      let savedSearchFailure = 0;
      try {
        savedSearches = await this.savedSearchesService.matchingForJob(job);
        const optedInUserIds = new Set(
          matchingProfiles.map((profile) => profile.userId),
        );
        savedSearches = savedSearches.filter((search) =>
          optedInUserIds.has(search.userId),
        );
      } catch (error) {
        savedSearchFailure = 1;
        this.logger.error(
          `Saved-search alerts could not be matched for job ${job.id}: ${
            error instanceof Error ? error.message : "unknown matching error"
          }`,
        );
      }
      const userIds = [
        ...new Set([
          ...matchingProfiles.map((profile) => profile.userId),
          ...savedSearches.map((search) => search.userId),
        ]),
      ];
      if (!userIds.length) return { queued: 0, failed: savedSearchFailure };
      const recipients = await this.usersRepository.findBy(
        userIds.map((id) => ({ id, isActive: true })),
      );
      const matchingSearches = new Map<number, string[]>();
      savedSearches.forEach((search) => {
        const names = matchingSearches.get(search.userId) ?? [];
        names.push(search.name);
        matchingSearches.set(search.userId, names);
      });
      const appUrl = process.env.PUBLIC_APP_URL?.trim();
      const jobUrl = appUrl
        ? `${appUrl.replace(/\/+$/, "")}/#job/${encodeURIComponent(job.id)}`
        : null;
      const results = await Promise.allSettled(
        recipients.map((recipient) =>
          this.emailDelivery.sendNotification(
            recipient.email,
            `${emailFeatured ? "Featured job" : "New job"} matching your preferences: ${job.title}`,
            `${emailFeatured ? "Featured opportunity: " : ""}${job.title} at ${job.company} in ${job.location} matches your saved job preferences${matchingSearches.has(recipient.id) ? ` (${matchingSearches.get(recipient.id)?.join(", ")})` : ""}.${jobUrl ? ` View this listing: ${jobUrl}` : ""}`,
            featuredPlacementId
              ? `featured-placement:${featuredPlacementId}:${recipient.id}`
              : `job-alert:${job.id}:${recipient.id}:${job.createdAt.toISOString()}`,
            "job_alert",
            {
              jobTitle: job.title,
              company: job.company,
              location: job.location,
              savedSearchNames: matchingSearches.has(recipient.id)
                ? ` (${matchingSearches.get(recipient.id)?.join(", ")})`
                : "",
              jobUrl: jobUrl ? ` View this listing: ${jobUrl}` : "",
            },
            { userId: recipient.id, category: "job_alert" },
          ),
        ),
      );
      const queued = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const failed = results.length - queued + savedSearchFailure;
      if (failed) {
        this.logger.error(
          `${failed} job alert email(s) could not be queued for job ${job.id}.`,
        );
      }
      return { queued, failed };
    } catch (error) {
      this.logger.error(
        `Job alerts could not be processed for job ${job.id}: ${
          error instanceof Error ? error.message : "unknown notification error"
        }`,
      );
      return { queued: 0, failed: 1 };
    }
  }
}
