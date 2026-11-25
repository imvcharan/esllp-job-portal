import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  DataSource,
  EntityManager,
  IsNull,
  MoreThan,
  QueryFailedError,
  Repository,
} from "typeorm";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AuditService } from "../audit/audit.service";
import { EmailDeliveryService } from "../auth/email-delivery.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { CandidateApplication } from "../users/candidate-application.entity";
import { CandidateApplicationStatus } from "../users/candidate-application-status.entity";
import { CandidateApplicationOffer } from "../users/candidate-application-offer.entity";
import { CandidateApplicationMessage } from "../users/candidate-application-message.entity";
import { CandidateProfile } from "../users/candidate-profile.entity";
import { CandidateFileStorageService } from "../users/candidate-file-storage.service";
import { EmployerApprovalStatus, User, UserRole } from "../users/user.entity";
import { Job } from "../jobs/job.entity";
import { normalizeJobSkills } from "../jobs/job.constants";
import { CandidateApplicationsService } from "../users/candidate-applications.service";
import {
  CreateEmployerJobDto,
  BulkValidateEmployerJobsDto,
  UpdateEmployerJobDto,
} from "./dto/employer-job.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import {
  CreateEmployerInterviewDto,
  EmployerInterviewFeedbackDto,
  CreateEmployerOfferDto,
  CreateEmployerNoteDto,
  EmployerApplicantsQueryDto,
  EmployerHiringReportQueryDto,
  UpdateEmployerInterviewDto,
  InviteTeamMemberDto,
  UpdateTeamMemberDto,
} from "./dto/employer-workflow.dto";
import { ResolveCandidateWithdrawalDto } from "../users/dto/resolve-candidate-withdrawal.dto";
import { EmployerApplicationNote } from "./employer-application-note.entity";
import { EmployerApplicationTag } from "./employer-application-tag.entity";
import { EmployerInterview } from "./employer-interview.entity";
import { EmployerInterviewFeedback } from "./employer-interview-feedback.entity";
import {
  EmployerOrganizationMember,
  OrganizationMemberRole,
} from "./organization-member.entity";
import { EmployerOrganization } from "./organization.entity";
import { UserNotification } from "./user-notification.entity";
import { JobsService } from "../jobs/jobs.service";
import { RazorpayConfigurationService } from "../payments/razorpay-configuration.service";
import { PlatformConfigurationService } from "../platform-config/platform-configuration.service";
import { EmployerSavedSearch } from "./employer-saved-search.entity";
import { EmployerApplicationScorecard } from "./employer-application-scorecard.entity";
import { EmployerApplicationScorecardDto } from "./dto/employer-application-scorecard.dto";
import { CandidateApplicationDocument } from "../users/candidate-application-document.entity";
import { CreateEmployerSavedSearchDto } from "./dto/employer-saved-search.dto";
import { UpdateEmployerSavedSearchDto } from "./dto/update-employer-saved-search.dto";
import { compileCandidateSearchQuery } from "./candidate-search-query";
import {
  currentJobDeadlineDate,
  jobPublicationError,
} from "../jobs/job.constants";
import { FeaturedJobPlacement } from "./featured-job-placement.entity";
import { employerPlanLimits } from "./employer-entitlements";
import { GoogleCalendarService } from "./google-calendar.service";
import { UpdateEmployerBillingProfileDto } from "./dto/update-employer-billing-profile.dto";
import { OpenSearchService } from "../infrastructure/open-search.service";
import { backgroundWorkersEnabled } from "../infrastructure/process-role";

type PaidPlanKey = "starter" | "growth" | "business" | "enterprise";

function isPaidPlanKey(value: string | null): value is PaidPlanKey {
  return (
    value === "starter" ||
    value === "growth" ||
    value === "business" ||
    value === "enterprise"
  );
}

const JOB_MANAGERS = [
  OrganizationMemberRole.OWNER,
  OrganizationMemberRole.ADMIN,
  OrganizationMemberRole.RECRUITER,
];
const APPLICATION_MANAGERS = [
  ...JOB_MANAGERS,
  OrganizationMemberRole.HIRING_MANAGER,
];
type JsonObject = Record<string, unknown>;

function asJsonObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}
const TEAM_MANAGERS = [
  OrganizationMemberRole.OWNER,
  OrganizationMemberRole.ADMIN,
];

type EmployerContext = {
  organization: EmployerOrganization;
  membership: EmployerOrganizationMember;
};

@Injectable()
export class EmployersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmployersService.name);
  private reconciliationTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EmployerOrganization)
    private readonly organizations: Repository<EmployerOrganization>,
    @InjectRepository(EmployerOrganizationMember)
    private readonly members: Repository<EmployerOrganizationMember>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(CandidateProfile)
    private readonly candidateProfiles: Repository<CandidateProfile>,
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
    @InjectRepository(CandidateApplication)
    private readonly applications: Repository<CandidateApplication>,
    @InjectRepository(CandidateApplicationStatus)
    private readonly applicationStatuses: Repository<CandidateApplicationStatus>,
    @InjectRepository(CandidateApplicationOffer)
    private readonly offers: Repository<CandidateApplicationOffer>,
    @InjectRepository(CandidateApplicationMessage)
    private readonly messages: Repository<CandidateApplicationMessage>,
    @InjectRepository(EmployerApplicationNote)
    private readonly notes: Repository<EmployerApplicationNote>,
    @InjectRepository(EmployerApplicationTag)
    private readonly tags: Repository<EmployerApplicationTag>,
    @InjectRepository(EmployerInterview)
    private readonly interviews: Repository<EmployerInterview>,
    @InjectRepository(EmployerInterviewFeedback)
    private readonly interviewFeedback: Repository<EmployerInterviewFeedback>,
    @InjectRepository(UserNotification)
    private readonly notifications: Repository<UserNotification>,
    @InjectRepository(EmployerSavedSearch)
    private readonly employerSavedSearches: Repository<EmployerSavedSearch>,
    @InjectRepository(EmployerApplicationScorecard)
    private readonly scorecards: Repository<EmployerApplicationScorecard>,
    @InjectRepository(CandidateApplicationDocument)
    private readonly applicationDocuments: Repository<CandidateApplicationDocument>,
    private readonly applicationsService: CandidateApplicationsService,
    private readonly fileStorage: CandidateFileStorageService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly auditService: AuditService,
    private readonly jobsService: JobsService,
    private readonly razorpayConfiguration: RazorpayConfigurationService,
    private readonly platformConfiguration: PlatformConfigurationService,
    private readonly googleCalendar: GoogleCalendarService,
    @Optional()
    @Inject(OpenSearchService)
    private readonly search: OpenSearchService | null = null,
  ) {}

  onModuleInit() {
    if (!backgroundWorkersEnabled()) return;
    this.reconciliationTimer = setInterval(
      () => {
        void this.reconcileSubscriptions().catch((error: unknown) => {
          this.logger.error(
            `Subscription reconciliation failed: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
        });
      },
      15 * 60 * 1000,
    );
    this.reconciliationTimer.unref();
  }

  onModuleDestroy() {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  async listOrganizations(user: AuthenticatedUser) {
    await this.assertEmployerAccess(user.id, true);
    const rows = await this.members.find({
      where: { userId: user.id, status: "active" },
      relations: { organization: true },
      order: { createdAt: "ASC" },
    });
    return rows.map(({ organization, role }) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role,
      planKey: organization.planKey,
    }));
  }

  async getCompany(user: AuthenticatedUser, organizationId?: number) {
    const { organization, membership } = await this.getContext(
      user.id,
      organizationId,
      true,
    );
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      website: organization.website,
      logoUrl: organization.logoUrl,
      industry: organization.industry,
      companySize: organization.companySize,
      description: organization.description,
      verificationStatus: organization.verificationStatus,
      verificationDetails: organization.verificationDetails,
      verificationNote: organization.verificationNote,
      verificationRequestedAt: organization.verificationRequestedAt,
      verifiedAt: organization.verifiedAt,
      planKey: organization.planKey,
      subscriptionStatus: organization.subscriptionStatus,
      subscriptionCurrentPeriodEnd: organization.subscriptionCurrentPeriodEnd,
      role: membership.role,
    };
  }

  async updateCompany(
    user: AuthenticatedUser,
    dto: UpdateCompanyDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, TEAM_MANAGERS);
    let normalizedName: string | undefined;
    if (dto.name !== undefined) {
      normalizedName = dto.name.trim();
      if (normalizedName.length < 2) {
        throw new BadRequestException(
          "Company name must contain at least two non-whitespace characters.",
        );
      }
    }
    if (
      dto.industry !== undefined &&
      dto.industry?.trim() !== context.organization.industry
    )
      await this.platformConfiguration.assertTaxonomyValue(
        "industries",
        dto.industry,
      );
    const identityChanged =
      (normalizedName !== undefined &&
        normalizedName !== context.organization.name) ||
      (dto.website !== undefined &&
        (dto.website?.trim() || null) !== context.organization.website);
    const verificationInvalidated =
      identityChanged &&
      context.organization.verificationStatus !== "unsubmitted";
    if (normalizedName !== undefined) {
      context.organization.name = normalizedName;
      context.organization.slug = `${this.slugify(normalizedName)}-${context.organization.id}`;
    }
    if (dto.website !== undefined)
      context.organization.website = dto.website?.trim() || null;
    if (dto.logoUrl !== undefined)
      context.organization.logoUrl = dto.logoUrl?.trim() || null;
    if (dto.industry !== undefined)
      context.organization.industry = dto.industry?.trim() || null;
    if (dto.companySize !== undefined)
      context.organization.companySize = dto.companySize || null;
    if (dto.description !== undefined)
      context.organization.description = dto.description?.trim() || null;
    if (verificationInvalidated) {
      context.organization.verificationStatus = "unsubmitted";
      context.organization.verificationDetails = null;
      context.organization.verificationNote = null;
      context.organization.verificationRequestedAt = null;
      context.organization.verifiedAt = null;
    }
    const saved = await this.dataSource.transaction(async (manager) => {
      const savedOrganization = await manager
        .getRepository(EmployerOrganization)
        .save(context.organization);
      if (normalizedName !== undefined) {
        const jobs = manager.getRepository(Job);
        const organizationJobs = await jobs.findBy({
          organizationId: savedOrganization.id,
        });
        await jobs.update(
          { organizationId: savedOrganization.id },
          { company: savedOrganization.name },
        );
        for (const job of organizationJobs) {
          job.company = savedOrganization.name;
          await this.jobsService.syncSearchIndex(job, manager);
        }
      }
      return savedOrganization;
    });
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.company_updated",
      targetType: "employer_organization",
      targetId: saved.id,
      details: { fieldCount: Object.keys(dto).length },
    });
    if (verificationInvalidated) {
      await this.auditService.record({
        actorUserId: user.id,
        action: "employer.company_verification_invalidated",
        targetType: "employer_organization",
        targetId: saved.id,
        details: { organizationId: saved.id },
      });
    }
    return saved;
  }

  async requestCompanyVerification(
    user: AuthenticatedUser,
    details: string,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, TEAM_MANAGERS);
    const normalizedDetails = details.trim();
    if (normalizedDetails.length < 30 || normalizedDetails.length > 2000) {
      throw new BadRequestException(
        "Provide 30 to 2,000 characters describing the company registration and public evidence.",
      );
    }
    if (context.organization.verificationStatus === "verified") {
      throw new ConflictException(
        "This company is already verified. Contact support if its details have changed.",
      );
    }
    if (context.organization.verificationStatus === "pending") {
      throw new ConflictException(
        "A company-verification request is already waiting for review.",
      );
    }
    context.organization.verificationStatus = "pending";
    context.organization.verificationDetails = normalizedDetails;
    context.organization.verificationNote = null;
    context.organization.verificationRequestedAt = new Date();
    context.organization.verifiedAt = null;
    const organization = await this.organizations.save(context.organization);
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.company_verification_requested",
      targetType: "employer_organization",
      targetId: organization.id,
      details: { organizationId: organization.id },
    });
    return {
      verificationStatus: organization.verificationStatus,
      verificationRequestedAt: organization.verificationRequestedAt,
    };
  }

  async getDashboard(user: AuthenticatedUser, organizationId?: number) {
    const { organization, membership } = await this.getContext(
      user.id,
      organizationId,
      true,
    );
    const employerApprovalRequired = (await this.platformConfiguration.get())
      .employerApprovalRequired;
    const jobs = await this.jobs
      .createQueryBuilder("job")
      .where("job.organizationId = :organizationId", {
        organizationId: organization.id,
      })
      .getMany();
    const canViewHiringPipeline = APPLICATION_MANAGERS.includes(
      membership.role,
    );
    const jobIds = jobs.map((job) => job.id);
    const pipelineStage = `CASE
        WHEN application.status = 'offer' AND EXISTS (
          SELECT 1 FROM candidate_application_offers offer
          WHERE offer.application_id = application.id
            AND (
              offer.status = 'expired'
              OR (offer.status = 'pending' AND offer.expires_at <= NOW())
            )
        ) THEN 'offer_expired'
        ELSE application.status
      END`;
    const stageCounts =
      canViewHiringPipeline && jobIds.length
        ? await this.applications
            .createQueryBuilder("application")
            .select(pipelineStage, "status")
            .addSelect("COUNT(*)", "count")
            .where("application.jobId IN (:...jobIds)", { jobIds })
            .groupBy(pipelineStage)
            .getRawMany<{ status: string; count: string }>()
        : [];
    const recentApplications =
      canViewHiringPipeline &&
      jobIds.length &&
      (user.employerApprovalStatus === EmployerApprovalStatus.APPROVED ||
        !employerApprovalRequired)
        ? await this.applications
            .createQueryBuilder("application")
            .innerJoinAndSelect("application.job", "job")
            .where("application.jobId IN (:...jobIds)", { jobIds })
            .orderBy("application.createdAt", "DESC")
            .take(5)
            .getMany()
        : [];
    const recentOffers = recentApplications.length
      ? await this.offers.find({
          where: recentApplications.map((application) => ({
            applicationId: application.id,
          })),
        })
      : [];
    const expiredOfferApplicationIds = new Set(
      recentOffers
        .filter(
          (offer) =>
            offer.status === "expired" ||
            (offer.status === "pending" &&
              offer.expiresAt.getTime() <= Date.now()),
        )
        .map((offer) => offer.applicationId),
    );
    const activeJobs = jobs.filter((job) => job.isActive).length;
    const limits = await this.limitsFor(organization);
    const unreadNotifications = await this.notifications.countBy({
      userId: user.id,
      readAt: IsNull(),
    });
    return {
      organization: {
        id: organization.id,
        name: organization.name,
        planKey: organization.planKey,
        subscriptionStatus: organization.subscriptionStatus,
        role: membership.role,
      },
      metrics: {
        activeJobs,
        draftJobs: jobs.length - activeJobs,
        totalApplicants: stageCounts.reduce(
          (total, entry) => total + Number(entry.count),
          0,
        ),
        unreadNotifications,
        pipeline: Object.fromEntries(
          stageCounts.map((entry) => [entry.status, Number(entry.count)]),
        ),
      },
      limits: {
        activeJobs: limits.activeJobs,
        seats: limits.seats,
        resumeCredits: limits.resumeCredits,
        jobsRemaining: Math.max(0, limits.activeJobs - activeJobs),
      },
      recentApplications:
        user.employerApprovalStatus === EmployerApprovalStatus.APPROVED ||
        !employerApprovalRequired
          ? recentApplications.map((application) => ({
              id: application.id,
              status: expiredOfferApplicationIds.has(application.id)
                ? "offer_expired"
                : application.status,
              createdAt: application.createdAt,
              job: { id: application.job.id, title: application.job.title },
            }))
          : [],
    };
  }

  async hiringReport(
    user: AuthenticatedUser,
    query: EmployerHiringReportQueryDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const parseDate = (value: string | undefined) => {
      if (!value) return null;
      const date = new Date(`${value}T00:00:00.000Z`);
      if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      )
        throw new BadRequestException("Use valid dates for the report range.");
      return value;
    };
    const from = parseDate(query.from);
    const to = parseDate(query.to);
    if (from && to && from > to)
      throw new BadRequestException("The start date must not follow the end date.");
    if (
      from &&
      to &&
      (new Date(`${to}T00:00:00.000Z`).getTime() -
        new Date(`${from}T00:00:00.000Z`).getTime()) /
        86_400_000 >
        366
    )
      throw new BadRequestException(
        "Hiring reports are limited to a 12-month date range.",
      );
    if (
      query.jobId &&
      !(await this.jobs.findOneBy({
        id: query.jobId,
        organizationId: context.organization.id,
      }))
    )
      throw new NotFoundException("Job was not found in this company.");
    const parameters = [
      from,
      to,
      query.jobId ?? null,
      context.organization.id,
    ];
    const baseFilters = `
      job.organization_id = $4
      AND ($1::date IS NULL OR application.created_at >= $1::date)
      AND ($2::date IS NULL OR application.created_at < $2::date + INTERVAL '1 day')
      AND ($3::integer IS NULL OR job.id = $3)
    `;
    const [
      stageCounts,
      timeToHire,
      recruiterWorkload,
      interviewOutcomes,
      applicantCount,
    ] =
      await Promise.all([
        this.dataSource.query(
          `WITH filtered_applications AS (
             SELECT application.id, application.status
             FROM candidate_applications application
             INNER JOIN jobs job ON job.id = application.job_id
             WHERE ${baseFilters}
           ), reached_stages AS (
             SELECT id AS application_id, status AS stage
             FROM filtered_applications
             UNION
             SELECT history.application_id, history.to_status AS stage
             FROM candidate_application_status_history history
             INNER JOIN filtered_applications application
               ON application.id = history.application_id
           )
           SELECT stage AS status, COUNT(DISTINCT application_id)::int AS count
           FROM reached_stages
           GROUP BY stage
           ORDER BY stage`,
          parameters,
        ) as Promise<Array<{ status: string; count: number | string }>>,
        this.dataSource.query(
          `WITH filtered_applications AS (
             SELECT application.id, application.created_at, application.status
             FROM candidate_applications application
             INNER JOIN jobs job ON job.id = application.job_id
             WHERE ${baseFilters}
           ), hires AS (
             SELECT application.id, application.created_at,
                    MIN(history.created_at) FILTER (
                      WHERE history.to_status = 'hired'
                    ) AS hired_at,
                    application.status
             FROM filtered_applications application
             LEFT JOIN candidate_application_status_history history
               ON history.application_id = application.id
             GROUP BY application.id, application.created_at, application.status
           )
           SELECT COUNT(*) FILTER (WHERE hired_at IS NOT NULL)::int AS hired,
                  ROUND(AVG(EXTRACT(EPOCH FROM (hired_at - created_at)) / 86400)::numeric, 1) AS "averageDaysToHire",
                  ROUND((percentile_cont(0.5) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (hired_at - created_at)) / 86400
                  ))::numeric, 1) AS "medianDaysToHire"
           FROM hires
           WHERE hired_at IS NOT NULL`,
          parameters,
        ) as Promise<
          Array<{
            hired: number | string;
            averageDaysToHire: number | string | null;
            medianDaysToHire: number | string | null;
          }>
        >,
        this.dataSource.query(
          `SELECT COALESCE(application.assigned_to_user_id, 0)::int AS "userId",
                  COALESCE(member.display_name, 'Unassigned') AS "recruiter",
                  COUNT(*)::int AS "assignedCount",
                  COUNT(*) FILTER (
                    WHERE application.status NOT IN
                      ('hired','rejected','withdrawn','offer_accepted','offer_declined')
                  )::int AS "openCount",
                  COUNT(*) FILTER (WHERE application.status = 'hired')::int AS "hiredCount"
           FROM candidate_applications application
           INNER JOIN jobs job ON job.id = application.job_id
           LEFT JOIN users member ON member.id = application.assigned_to_user_id
           WHERE ${baseFilters}
           GROUP BY application.assigned_to_user_id, member.display_name
           ORDER BY "assignedCount" DESC, recruiter`,
          parameters,
        ) as Promise<
          Array<{
            userId: number;
            recruiter: string;
            assignedCount: number | string;
            openCount: number | string;
            hiredCount: number | string;
          }>
        >,
        this.dataSource.query(
          `SELECT interview.status,
                  interview.candidate_response AS "candidateResponse",
                  COUNT(*)::int AS count
           FROM employer_interviews interview
           INNER JOIN candidate_applications application
             ON application.id = interview.application_id
           INNER JOIN jobs job ON job.id = application.job_id
           WHERE ${baseFilters}
           GROUP BY interview.status, interview.candidate_response
           ORDER BY interview.status, interview.candidate_response`,
          parameters,
        ) as Promise<
          Array<{
            status: string;
            candidateResponse: string;
            count: number | string;
          }>
        >,
        this.dataSource.query(
          `SELECT COUNT(*)::int AS total
           FROM candidate_applications application
           INNER JOIN jobs job ON job.id = application.job_id
           WHERE ${baseFilters}`,
          parameters,
        ) as Promise<Array<{ total: number | string }>>,
      ]);
    const total = Number(applicantCount[0]?.total ?? 0);
    const counts = new Map(
      stageCounts.map((entry) => [entry.status, Number(entry.count)]),
    );
    const hireMetrics = timeToHire[0];
    return {
      generatedAt: new Date().toISOString(),
      filters: { from, to, jobId: query.jobId ?? null },
      funnel: stageCounts.map((entry) => ({
        status: entry.status,
        count: Number(entry.count),
        percentOfApplicants:
          total > 0 ? Math.round((Number(entry.count) / total) * 1000) / 10 : 0,
      })),
      conversion: {
        applicants: total,
        reachedInterview: counts.get("interview") ?? 0,
        hired: Number(hireMetrics?.hired ?? 0),
        interviewRate:
          total > 0
            ? Math.round(((counts.get("interview") ?? 0) / total) * 1000) / 10
            : 0,
        hireRate:
          total > 0
            ? Math.round((Number(hireMetrics?.hired ?? 0) / total) * 1000) / 10
            : 0,
      },
      timeToHire: {
        averageDays:
          hireMetrics?.averageDaysToHire == null
            ? null
            : Number(hireMetrics.averageDaysToHire),
        medianDays:
          hireMetrics?.medianDaysToHire == null
            ? null
            : Number(hireMetrics.medianDaysToHire),
      },
      recruiterWorkload: recruiterWorkload.map((entry) => ({
        ...entry,
        assignedCount: Number(entry.assignedCount),
        openCount: Number(entry.openCount),
        hiredCount: Number(entry.hiredCount),
      })),
      interviewOutcomes: interviewOutcomes.map((entry) => ({
        ...entry,
        count: Number(entry.count),
      })),
    };
  }

  async listJobs(
    user: AuthenticatedUser,
    page = 1,
    limit = 25,
    organizationId?: number,
  ) {
    const { organization } = await this.getContext(
      user.id,
      organizationId,
      true,
    );
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [items, total] = await this.jobs.findAndCount({
      where: { organizationId: organization.id },
      order: { createdAt: "DESC" },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    const counts = await this.applications
      .createQueryBuilder("application")
      .select("application.jobId", "jobId")
      .addSelect("COUNT(*)", "count")
      .where("application.jobId IN (:...ids)", {
        ids: items.length ? items.map((job) => job.id) : [-1],
      })
      .groupBy("application.jobId")
      .getRawMany<{ jobId: string; count: string }>();
    const countByJob = new Map(
      counts.map((item) => [Number(item.jobId), Number(item.count)]),
    );
    return {
      items: items.map((job) => ({
        ...job,
        applicationCount: countByJob.get(job.id) ?? 0,
        expired: Boolean(
          job.applicationDeadline &&
          job.applicationDeadline < currentJobDeadlineDate(),
        ),
      })),
      total,
      page: safePage,
      limit: safeLimit,
      limits: await this.limitsFor(organization),
    };
  }

  async createJob(
    user: AuthenticatedUser,
    dto: CreateEmployerJobDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, JOB_MANAGERS);
    await this.assertEmployerJobTaxonomies({
      category: dto.category,
      industry: dto.industry,
      employmentType: dto.employmentType ?? "full-time",
      workplaceType: dto.workplaceType ?? "onsite",
    });
    const job = await this.dataSource.transaction(async (manager) => {
      const jobs = manager.getRepository(Job);
      const created = await jobs.save(
        this.createJobDraft(jobs, user, context, dto),
      );
      await this.jobsService.syncSearchIndex(created, manager);
      return created;
    });
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.job_created",
      targetType: "job",
      targetId: job.id,
      details: { organizationId: context.organization.id, title: job.title },
    });
    return job;
  }

  async validateBulkJobs(
    user: AuthenticatedUser,
    jobInputs: unknown[],
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, JOB_MANAGERS);
    const rows = await Promise.all(
      jobInputs.map(async (input, index) => {
        const row = index + 2;
        if (
          typeof input !== "object" ||
          input === null ||
          Array.isArray(input)
        )
          return {
            row,
            valid: false,
            errors: ["Each CSV row must contain a job object."],
          };
        const dto = plainToInstance(CreateEmployerJobDto, input);
        const validationErrors = await validate(dto, {
          whitelist: true,
          forbidNonWhitelisted: true,
        });
        const errors = validationErrors.flatMap((error) => {
          const field = error.property;
          const own = Object.values(error.constraints ?? {}).map(
            (message) => `${field}: ${message}`,
          );
          const children = (items: typeof error.children): string[] =>
            (items ?? []).flatMap((child) => {
              const childErrors = Object.values(
                child.constraints ?? {},
              ).map((message) => `${field}.${child.property}: ${message}`);
              return [...childErrors, ...children(child.children)];
            });
          return [...own, ...children(error.children)];
        });
        if (errors.length)
          return { row, valid: false, errors };
        try {
          this.validateSalary(dto.salaryMin, dto.salaryMax);
          await this.assertEmployerJobTaxonomies({
            category: dto.category,
            industry: dto.industry,
            employmentType: dto.employmentType ?? "full-time",
            workplaceType: dto.workplaceType ?? "onsite",
          });
        } catch (error) {
          return {
            row,
            valid: false,
            errors: [
              error instanceof Error
                ? error.message
                : "This job contains an invalid value.",
            ],
          };
        }
        return { row, valid: true, errors: [] as string[] };
      }),
    );
    return {
      valid: rows.every((row) => row.valid),
      rows,
      total: rows.length,
    };
  }

  async bulkCreateJobs(
    user: AuthenticatedUser,
    jobDtos: CreateEmployerJobDto[],
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, JOB_MANAGERS);
    await Promise.all(
      jobDtos.map((dto) =>
        this.assertEmployerJobTaxonomies({
          category: dto.category,
          industry: dto.industry,
          employmentType: dto.employmentType ?? "full-time",
          workplaceType: dto.workplaceType ?? "onsite",
        }),
      ),
    );
    const items = await this.dataSource.transaction(async (manager) => {
      const jobs = manager.getRepository(Job);
      const created: Job[] = [];
      for (const dto of jobDtos) {
        const job = await jobs.save(
          this.createJobDraft(jobs, user, context, dto),
        );
        await this.jobsService.syncSearchIndex(job, manager);
        await this.auditService.record(
          {
            actorUserId: user.id,
            action: "employer.job_created",
            targetType: "job",
            targetId: job.id,
            details: {
              organizationId: context.organization.id,
              title: job.title,
              source: "bulk_import",
            },
          },
          manager,
        );
        created.push(job);
      }
      return created;
    });
    return { items, total: items.length };
  }

  private createJobDraft(
    jobs: Repository<Job>,
    user: AuthenticatedUser,
    context: EmployerContext,
    dto: CreateEmployerJobDto,
  ) {
    this.validateSalary(dto.salaryMin, dto.salaryMax);
    return jobs.create({
      ...dto,
      title: dto.title.trim(),
      company: context.organization.name,
      location: dto.location.trim(),
      category: dto.category?.trim() || null,
      industry: dto.industry?.trim() || null,
      skills: normalizeJobSkills(dto.skills),
      workplaceType: dto.workplaceType?.trim() || "onsite",
      employmentType: dto.employmentType?.trim() || "full-time",
      salaryMin: dto.salaryMin ?? null,
      salaryMax: dto.salaryMax ?? null,
      salaryCurrency: dto.salaryCurrency ?? "INR",
      salaryPeriod: dto.salaryPeriod ?? "year",
      applicationDeadline: dto.applicationDeadline ?? null,
      numberOfOpenings: dto.numberOfOpenings ?? 1,
      experience: dto.experience?.trim() || null,
      description: dto.description?.trim() || null,
      applicationQuestions: this.normalizeApplicationQuestions(
        dto.applicationQuestions ?? [],
      ),
      requiredDocuments: this.normalizeRequiredDocuments(
        dto.requiredDocuments ?? [],
      ),
      moderationStatus: "draft",
      moderationNote: null,
      isActive: false,
      employerUserId: user.id,
      organizationId: context.organization.id,
    });
  }

  private async assertEmployerJobTaxonomies(values: {
    category?: string | null;
    industry?: string | null;
    employmentType?: string | null;
    workplaceType?: string | null;
  }) {
    await Promise.all([
      this.platformConfiguration.assertTaxonomyValue(
        "jobCategories",
        values.category,
      ),
      this.platformConfiguration.assertTaxonomyValue(
        "industries",
        values.industry,
      ),
      this.platformConfiguration.assertTaxonomyValue(
        "employmentTypes",
        values.employmentType,
      ),
      this.platformConfiguration.assertTaxonomyValue(
        "workplaceTypes",
        values.workplaceType,
      ),
    ]);
  }

  async updateJob(
    user: AuthenticatedUser,
    jobId: number,
    dto: UpdateEmployerJobDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, JOB_MANAGERS);
    const job = await this.findOrganizationJob(jobId, context.organization.id);
    const jobApprovalRequired = (await this.platformConfiguration.get())
      .jobApprovalRequired;
    const wasActive = job.isActive;
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
    this.validateSalary(
      dto.salaryMin === undefined ? job.salaryMin : dto.salaryMin,
      dto.salaryMax === undefined ? job.salaryMax : dto.salaryMax,
    );
    const requiresReview =
      wasActive &&
      jobApprovalRequired &&
      [
        dto.title !== undefined && dto.title.trim() !== job.title,
        dto.location !== undefined && dto.location.trim() !== job.location,
        dto.category !== undefined &&
          (dto.category?.trim() || null) !== job.category,
        dto.industry !== undefined &&
          (dto.industry?.trim() || null) !== job.industry,
        dto.skills !== undefined &&
          JSON.stringify(normalizeJobSkills(dto.skills)) !==
            JSON.stringify(job.skills),
        dto.workplaceType !== undefined &&
          dto.workplaceType.trim() !== job.workplaceType,
        dto.employmentType !== undefined &&
          dto.employmentType.trim() !== job.employmentType,
        dto.salaryMin !== undefined && dto.salaryMin !== job.salaryMin,
        dto.salaryMax !== undefined && dto.salaryMax !== job.salaryMax,
        dto.salaryCurrency !== undefined &&
          dto.salaryCurrency !== job.salaryCurrency,
        dto.salaryPeriod !== undefined && dto.salaryPeriod !== job.salaryPeriod,
        dto.applicationDeadline !== undefined &&
          dto.applicationDeadline !== job.applicationDeadline,
        dto.numberOfOpenings !== undefined &&
          dto.numberOfOpenings !== job.numberOfOpenings,
        dto.experience !== undefined &&
          (dto.experience?.trim() || null) !== job.experience,
        dto.description !== undefined &&
          (dto.description?.trim() || null) !== job.description,
        dto.applicationQuestions !== undefined,
        dto.requiredDocuments !== undefined,
      ].some(Boolean);
    if (dto.title !== undefined) job.title = dto.title.trim();
    if (dto.location !== undefined) job.location = dto.location.trim();
    if (dto.category !== undefined) job.category = dto.category?.trim() || null;
    if (dto.industry !== undefined) job.industry = dto.industry?.trim() || null;
    if (dto.skills !== undefined) job.skills = normalizeJobSkills(dto.skills);
    if (dto.workplaceType !== undefined)
      job.workplaceType = dto.workplaceType.trim();
    if (dto.employmentType !== undefined)
      job.employmentType = dto.employmentType.trim();
    if (dto.workplaceType !== undefined) job.workplaceType = dto.workplaceType;
    if (dto.employmentType !== undefined)
      job.employmentType = dto.employmentType;
    if (dto.salaryMin !== undefined) job.salaryMin = dto.salaryMin;
    if (dto.salaryMax !== undefined) job.salaryMax = dto.salaryMax;
    if (dto.salaryCurrency !== undefined)
      job.salaryCurrency = dto.salaryCurrency;
    if (dto.salaryPeriod !== undefined) job.salaryPeriod = dto.salaryPeriod;
    if (dto.applicationDeadline !== undefined)
      job.applicationDeadline = dto.applicationDeadline;
    if (dto.numberOfOpenings !== undefined)
      job.numberOfOpenings = dto.numberOfOpenings;
    if (dto.experience !== undefined)
      job.experience = dto.experience?.trim() || null;
    if (dto.description !== undefined)
      job.description = dto.description?.trim() || null;
    if (dto.applicationQuestions !== undefined)
      job.applicationQuestions = this.normalizeApplicationQuestions(
        dto.applicationQuestions,
      );
    if (dto.requiredDocuments !== undefined)
      job.requiredDocuments = this.normalizeRequiredDocuments(
        dto.requiredDocuments,
      );
    job.company = context.organization.name;
    if (
      job.isActive &&
      (dto.title !== undefined ||
        dto.location !== undefined ||
        dto.description !== undefined)
    ) {
      const readinessError = jobPublicationError(job);
      if (readinessError) throw new BadRequestException(readinessError);
    }
    if (requiresReview) {
      job.isActive = false;
      job.moderationStatus = "pending_review";
      job.moderationNote = null;
    }
    const saved = await this.dataSource.transaction(async (manager) => {
      const updated = await manager.getRepository(Job).save(job);
      await this.jobsService.syncSearchIndex(updated, manager);
      return updated;
    });
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.job_updated",
      targetType: "job",
      targetId: job.id,
      details: { organizationId: context.organization.id },
    });
    return { ...saved, reviewRequired: requiresReview };
  }

  async publishJob(
    user: AuthenticatedUser,
    jobId: number,
    organizationId?: number,
  ) {
    const { jobApprovalRequired } = await this.platformConfiguration.get();
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, JOB_MANAGERS);
    const { job, published } = await this.dataSource.transaction(
      async (manager) => {
        const organization = await manager
          .getRepository(EmployerOrganization)
          .findOne({
            where: { id: context.organization.id },
            lock: { mode: "pessimistic_write" },
          });
        if (!organization)
          throw new NotFoundException("Company workspace was not found.");
        const jobs = manager.getRepository(Job);
        const job = await jobs.findOne({
          where: { id: jobId, organizationId: organization.id },
          lock: { mode: "pessimistic_write" },
        });
        if (!job)
          throw new NotFoundException("Job was not found in this company.");
        if (job.isActive) return { job, published: false };
        const readinessError = jobPublicationError(job);
        if (readinessError) throw new BadRequestException(readinessError);
        if (
          job.applicationDeadline &&
          job.applicationDeadline < currentJobDeadlineDate()
        ) {
          throw new BadRequestException(
            "A job with a past application deadline cannot be published.",
          );
        }
        if (!jobApprovalRequired || job.moderationStatus === "approved") {
          job.moderationStatus = "approved";
          job.moderationNote = null;
          await this.assertJobQuota(organization, jobs);
          job.isActive = true;
        } else {
          job.moderationStatus = "pending_review";
          job.moderationNote = null;
          job.isActive = false;
        }
        const publishedJob = await jobs.save(job);
        await this.jobsService.syncSearchIndex(publishedJob, manager);
        if (publishedJob.isActive) {
          await this.jobsService.enqueueJobAlertGeneration(
            publishedJob.id,
            manager,
          );
        }
        return { job: publishedJob, published: true };
      },
    );
    if (!published || !job.isActive)
      return {
        job,
        reviewRequired: job.moderationStatus === "pending_review",
        alertResult: { queued: 0, failed: 0 },
      };
    const alertResult = await this.jobsService.processJobAlert(job.id);
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.job_published",
      targetType: "job",
      targetId: job.id,
      details: { organizationId: context.organization.id },
    });
    return { job, alertResult };
  }

  async closeJob(
    user: AuthenticatedUser,
    jobId: number,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, JOB_MANAGERS);
    const saved = await this.dataSource.transaction(async (manager) => {
      const jobs = manager.getRepository(Job);
      const job = await jobs.findOneBy({
        id: jobId,
        organizationId: context.organization.id,
      });
      if (!job)
        throw new NotFoundException("Job was not found in this company.");
      job.isActive = false;
      job.moderationStatus = "closed";
      const closed = await jobs.save(job);
      await this.jobsService.syncSearchIndex(closed, manager);
      return closed;
    });
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.job_closed",
      targetType: "job",
      targetId: saved.id,
      details: { organizationId: context.organization.id },
    });
    return saved;
  }

  async createApplicationFileUrl(
    user: AuthenticatedUser,
    applicationId: number,
    documentId: number | null,
    organizationId?: number,
  ): Promise<{ url: string }> {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const application = await this.applications
      .createQueryBuilder("application")
      .innerJoin("application.job", "job")
      .where("application.id = :applicationId", { applicationId })
      .andWhere("job.organizationId = :organizationId", {
        organizationId: context.organization.id,
      })
      .getOne();
    if (!application) {
      throw new NotFoundException("Application was not found.");
    }

    let path = application.resumePath;
    let fileKind: "resume" | "application" = "resume";
    if (documentId !== null) {
      const document = await this.applicationDocuments.findOneBy({
        id: documentId,
        applicationId,
      });
      if (!document) {
        throw new NotFoundException("Application document was not found.");
      }
      path = document.filePath;
      fileKind = "application";
    }
    if (!path) {
      throw new NotFoundException("This application has no attached file.");
    }

    const url = await this.fileStorage.createSignedUrl(path);
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.application_file_accessed",
      targetType: "application",
      targetId: applicationId,
      details: { fileKind },
    });
    return { url };
  }

  async listApplicants(
    user: AuthenticatedUser,
    query: EmployerApplicantsQueryDto,
    organizationId?: number,
  ) {
    const { organization } = await this.getContext(user.id, organizationId);
    const applicationStages = (await this.platformConfiguration.get())
      .applicationStages;
    const systemStatuses = new Set([
      "offer",
      "offer_expired",
      "offer_accepted",
      "offer_declined",
      "hired",
      "withdrawal_requested",
      "withdrawn",
    ]);
    if (
      query.status &&
      query.status !== "all" &&
      !systemStatuses.has(query.status) &&
      !applicationStages.some((stage) => stage.key === query.status)
    ) {
      throw new BadRequestException("Choose a valid application status.");
    }
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const builder = this.applications
      .createQueryBuilder("application")
      .innerJoinAndSelect("application.job", "job")
      .innerJoinAndSelect("application.user", "candidate")
      .leftJoinAndSelect("application.assignedTo", "assignee")
      .where("job.organizationId = :organizationId", {
        organizationId: organization.id,
      });
    if (query.status && query.status !== "all") {
      if (query.status === "offer_expired") {
        builder.andWhere("application.status = 'offer'").andWhere(`EXISTS (
            SELECT 1 FROM candidate_application_offers offer
            WHERE offer.application_id = application.id
              AND (
                offer.status = 'expired'
                OR (offer.status = 'pending' AND offer.expires_at <= NOW())
              )
          )`);
      } else {
        builder.andWhere("application.status = :status", {
          status: query.status,
        });
      }
    }
    if (query.jobId) {
      builder.andWhere("application.jobId = :jobId", { jobId: query.jobId });
    }
    if (query.assignee && query.assignee !== "all") {
      if (query.assignee === "unassigned") {
        builder.andWhere("application.assignedToUserId IS NULL");
      } else {
        builder.andWhere("application.assignedToUserId = :assigneeUserId", {
          assigneeUserId: Number(query.assignee),
        });
      }
    }
    const tag = query.tag?.trim().toLowerCase();
    if (tag) {
      builder.andWhere(
        `EXISTS (
          SELECT 1
          FROM employer_application_tags filter_tag
          WHERE filter_tag.organization_id = :organizationId
            AND filter_tag.application_id = application.id
            AND filter_tag.label = :tag
        )`,
        { organizationId: organization.id, tag },
      );
    }
    const parseFilterDate = (value: string | undefined) => {
      if (!value) return null;
      const date = new Date(`${value}T00:00:00.000Z`);
      if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      ) {
        throw new BadRequestException(
          "Use valid dates for the applicant filter.",
        );
      }
      return date;
    };
    const appliedFrom = parseFilterDate(query.from);
    const appliedTo = parseFilterDate(query.to);
    if (appliedFrom && appliedTo && appliedFrom > appliedTo)
      throw new BadRequestException(
        "The start date must not follow the end date.",
      );
    if (appliedFrom)
      builder.andWhere("application.createdAt >= :appliedFrom", {
        appliedFrom,
      });
    if (appliedTo) {
      const exclusiveEnd = new Date(appliedTo);
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
      builder.andWhere("application.createdAt < :appliedTo", {
        appliedTo: exclusiveEnd,
      });
    }
    if (query.q?.trim()) {
      const terms = query.q.trim().split(/\s+/).filter(Boolean);
      terms.forEach((term, index) => {
        const parameter = `applicantSearch${index}`;
        const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
        builder.andWhere(
          `(candidate.displayName ILIKE :${parameter} ESCAPE '\\'
            OR job.title ILIKE :${parameter} ESCAPE '\\'
            OR application.coverLetter ILIKE :${parameter} ESCAPE '\\'
            OR application.profileSnapshot::text ILIKE :${parameter} ESCAPE '\\'
            OR application.applicationAnswers::text ILIKE :${parameter} ESCAPE '\\'
            OR EXISTS (
              SELECT 1 FROM employer_application_notes search_note
              WHERE search_note.organization_id = :organizationId
                AND search_note.application_id = application.id
                AND search_note.note ILIKE :${parameter} ESCAPE '\\'
            )
            OR EXISTS (
              SELECT 1 FROM employer_application_tags search_tag
              WHERE search_tag.organization_id = :organizationId
                AND search_tag.application_id = application.id
                AND search_tag.label ILIKE :${parameter} ESCAPE '\\'
            )
          )`,
          { [parameter]: pattern, organizationId: organization.id },
        );
      });
    }
    if (query.sort === "oldest") {
      builder.orderBy("application.createdAt", "ASC");
    } else if (query.sort === "name") {
      builder
        .orderBy("candidate.displayName", "ASC")
        .addOrderBy("application.createdAt", "DESC");
    } else {
      builder.orderBy("application.createdAt", "DESC");
    }
    builder.addOrderBy("application.id", "DESC");
    const [items, total] = await builder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const applicationIds = items.map((application) => application.id);
    const messageCounts = applicationIds.length
      ? await this.messages
          .createQueryBuilder("message")
          .select("message.applicationId", "applicationId")
          .addSelect("COUNT(*)", "count")
          .where("message.applicationId IN (:...applicationIds)", {
            applicationIds,
          })
          .groupBy("message.applicationId")
          .getRawMany<{
            applicationId: number | string;
            count: number | string;
          }>()
      : [];
    const messageCountByApplicationId = new Map(
      messageCounts.map((entry) => [
        Number(entry.applicationId),
        Number(entry.count),
      ]),
    );
    const historyPromise: Promise<CandidateApplicationStatus[]> =
      applicationIds.length
        ? this.applicationStatuses.find({
            where: applicationIds.map((applicationId) => ({ applicationId })),
            order: { createdAt: "ASC", id: "ASC" },
          })
        : Promise.resolve([]);
    const notesPromise: Promise<EmployerApplicationNote[]> =
      applicationIds.length
        ? this.notes.find({
            where: applicationIds.map((applicationId) => ({
              organizationId: organization.id,
              applicationId,
            })),
            relations: { author: true },
            order: { createdAt: "ASC" },
          })
        : Promise.resolve([]);
    const tagsPromise: Promise<EmployerApplicationTag[]> = applicationIds.length
      ? this.tags.find({
          where: applicationIds.map((applicationId) => ({
            organizationId: organization.id,
            applicationId,
          })),
          order: { label: "ASC" },
        })
      : Promise.resolve([]);
    const interviewsPromise: Promise<EmployerInterview[]> =
      applicationIds.length
        ? this.interviews.find({
            where: applicationIds.map((applicationId) => ({
              organizationId: organization.id,
              applicationId,
            })),
            relations: { interviewer: true },
            order: { startsAt: "ASC" },
          })
        : Promise.resolve([]);
    const [histories, notes, tags, interviews] = await Promise.all([
      historyPromise,
      notesPromise,
      tagsPromise,
      interviewsPromise,
    ]);
    const [offers, scorecards, documents, interviewFeedback] = await Promise.all([
      applicationIds.length
        ? this.offers.find({
            where: applicationIds.map((applicationId) => ({ applicationId })),
          })
        : Promise.resolve([]),
      applicationIds.length
        ? this.scorecards.find({
            where: applicationIds.map((applicationId) => ({
              organizationId: organization.id,
              applicationId,
            })),
            relations: { reviewer: true },
            order: { updatedAt: "DESC" },
          })
        : Promise.resolve([]),
      applicationIds.length
        ? this.applicationDocuments.find({
            where: applicationIds.map((applicationId) => ({ applicationId })),
            order: { createdAt: "ASC" },
          })
        : Promise.resolve([]),
      interviews.length
        ? this.interviewFeedback.find({
            where: interviews.map((interview) => ({
              interviewId: interview.id,
              organizationId: organization.id,
            })),
            relations: { reviewer: true },
            order: { updatedAt: "DESC" },
          })
        : Promise.resolve([]),
    ]);
    const fileScanStatuses = await this.fileStorage.scanStatuses([
      ...items.flatMap((application) =>
        application.resumePath ? [application.resumePath] : [],
      ),
      ...documents.map((document) => document.filePath),
    ]);
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.applicants_viewed",
      targetType: "employer_organization",
      targetId: organization.id,
      details: {
        page,
        resultCount: items.length,
        total,
        status: query.status ?? "all",
        jobId: query.jobId ?? null,
      },
    });
    return {
      items: items.map((application) => ({
        id: application.id,
        assigneeUserId: application.assignedToUserId,
        assigneeName: application.assignedTo?.displayName ?? null,
        status: (() => {
          const offer = offers.find(
            (item) => item.applicationId === application.id,
          );
          return application.status === "offer" &&
            (offer?.status === "expired" ||
              (offer?.status === "pending" &&
                offer.expiresAt.getTime() <= Date.now()))
            ? "offer_expired"
            : application.status;
        })(),
        coverLetter: application.coverLetter,
        applicationAnswers: application.applicationAnswers ?? [],
        scorecards: scorecards
          .filter((entry) => entry.applicationId === application.id)
          .map((entry) => ({
            reviewerUserId: entry.reviewerUserId,
            reviewerName: entry.reviewer.displayName,
            scores: entry.scores,
            recommendation: entry.recommendation,
            notes: entry.notes,
            updatedAt: entry.updatedAt,
          })),
        createdAt: application.createdAt,
        candidateName:
          application.profileShared &&
          typeof application.profileSnapshot?.displayName === "string"
            ? application.profileSnapshot.displayName
            : application.user.displayName,
        profile: application.profileShared ? application.profileSnapshot : null,
        resumeScanStatus: application.resumePath
          ? (fileScanStatuses.get(application.resumePath) ?? "pending")
          : null,
        resumeAvailable:
          application.resumePath !== null &&
          fileScanStatuses.get(application.resumePath) === "clean",
        resumeFileName: application.resumeFileName,
        documents: documents
          .filter((document) => document.applicationId === application.id)
          .map((document) => ({
            id: document.id,
            documentId: document.documentId,
            label: document.documentLabel,
            fileName: document.fileName,
            scanStatus: fileScanStatuses.get(document.filePath) ?? "pending",
          })),
        job: {
          id: application.job.id,
          title: application.job.title,
          company: application.job.company,
        },
        history: histories
          .filter((entry) => entry.applicationId === application.id)
          .map((entry) => ({
            fromStatus: entry.fromStatus,
            toStatus: entry.toStatus,
            note: entry.note,
            createdAt: entry.createdAt,
          })),
        offer: (() => {
          const offer =
            offers.find((item) => item.applicationId === application.id) ??
            null;
          return offer
            ? {
                ...offer,
                status:
                  offer.status === "expired" ||
                  (offer.status === "pending" &&
                    offer.expiresAt.getTime() <= Date.now())
                    ? "expired"
                    : offer.status,
              }
            : null;
        })(),
        messageCount: messageCountByApplicationId.get(application.id) ?? 0,
        internalNotes: notes
          .filter((entry) => entry.applicationId === application.id)
          .map((entry) => ({
            id: entry.id,
            note: entry.note,
            author: entry.author.displayName,
            createdAt: entry.createdAt,
          })),
        tags: tags
          .filter((entry) => entry.applicationId === application.id)
          .map(({ id, label }) => ({ id, label })),
        interviews: interviews
          .filter((entry) => entry.applicationId === application.id)
          .map((entry) => ({
            ...entry,
            interviewerName: entry.interviewer?.displayName ?? null,
            feedback: interviewFeedback
              .filter((feedback) => feedback.interviewId === entry.id)
              .map((feedback) => ({
                reviewerUserId: feedback.reviewerUserId,
                reviewerName: feedback.reviewer.displayName,
                scores: feedback.scores,
                recommendation: feedback.recommendation,
                notes: feedback.notes,
                updatedAt: feedback.updatedAt,
              })),
          })),
      })),
      total,
      page,
      limit,
      applicationStages,
    };
  }

  async saveApplicationScorecard(
    user: AuthenticatedUser,
    applicationId: number,
    dto: EmployerApplicationScorecardDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const application = await this.applications.findOne({
      where: { id: applicationId },
      relations: { job: true },
    });
    if (
      !application ||
      application.job.organizationId !== context.organization.id
    )
      throw new NotFoundException("Application was not found in this company.");

    const scoreEntries = Object.entries(dto.scores ?? {});
    if (
      scoreEntries.length < 1 ||
      scoreEntries.length > 10 ||
      scoreEntries.some(
        ([criterion, score]) =>
          !criterion.trim() ||
          criterion.length > 80 ||
          !Number.isInteger(score) ||
          score < 1 ||
          score > 5,
      )
    )
      throw new BadRequestException(
        "Provide 1 to 10 score criteria with integer ratings from 1 to 5.",
      );

    const existing = await this.scorecards.findOneBy({
      organizationId: context.organization.id,
      applicationId,
      reviewerUserId: user.id,
    });
    const scorecard = this.scorecards.create({
      ...(existing ?? {}),
      organizationId: context.organization.id,
      applicationId,
      reviewerUserId: user.id,
      scores: Object.fromEntries(
        scoreEntries.map(([criterion, score]) => [criterion.trim(), score]),
      ),
      recommendation: dto.recommendation,
      notes: dto.notes?.trim() || null,
    });
    const saved = await this.scorecards.save(scorecard);
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.application_scorecard_saved",
      targetType: "application",
      targetId: applicationId,
      details: {
        organizationId: context.organization.id,
        scorecardId: saved.id,
        criteriaCount: scoreEntries.length,
      },
    });
    return saved;
  }

  async searchCandidates(
    user: AuthenticatedUser,
    query = "",
    requestedPage = 1,
    requestedLimit = 20,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const page = Math.min(1_000_000, Math.max(1, requestedPage));
    const limit = Math.min(50, Math.max(1, requestedLimit));
    if (typeof query !== "string") {
      throw new BadRequestException("Candidate search must be text.");
    }
    if (query.length > 500) {
      throw new BadRequestException(
        "Candidate search must be 500 characters or fewer.",
      );
    }
    const searchTerm = query.trim();
    const compiledSearch = searchTerm
      ? compileCandidateSearchQuery(searchTerm)
      : null;
    const candidateSearchIds =
      searchTerm && this.search
        ? await this.search.searchCandidateIds(searchTerm)
        : null;
    const builder = this.candidateProfiles
      .createQueryBuilder("profile")
      .innerJoinAndSelect("profile.user", "candidate")
      .where("profile.profileVisibility = :visibility", {
        visibility: "recruiters",
      })
      .andWhere("candidate.role = :role AND candidate.isActive = true", {
        role: UserRole.CANDIDATE,
      });
    if (compiledSearch) {
      builder.andWhere(compiledSearch.expression, compiledSearch.parameters);
    }
    if (candidateSearchIds?.length) {
      builder.andWhere("profile.userId IN (:...candidateSearchIds)", {
        candidateSearchIds,
      });
    }
    if (compiledSearch?.rankExpression) {
      builder
        .orderBy(compiledSearch.rankExpression, "DESC")
        .addOrderBy(
          "CASE WHEN profile.premium_boost_until > NOW() THEN 0 ELSE 1 END",
          "ASC",
        );
    } else {
      builder.orderBy(
        "CASE WHEN profile.premium_boost_until > NOW() THEN 0 ELSE 1 END",
        "ASC",
      );
    }
    builder
      .addOrderBy("profile.premiumBoostUntil", "DESC", "NULLS LAST")
      .addOrderBy("profile.updatedAt", "DESC")
      .addOrderBy("profile.userId", "ASC");
    const [profiles, total] = await builder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const [entitlements, usage, resumeScanStatuses] = await Promise.all([
      this.limitsFor(context.organization),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS used,
                COALESCE(array_agg(candidate_user_id), ARRAY[]::integer[]) AS "candidateIds"
         FROM employer_candidate_resume_unlocks
         WHERE organization_id = $1 AND period_key = $2`,
        [context.organization.id, this.currentResumeCreditPeriod()],
      ) as Promise<Array<{ used: number | string; candidateIds: number[] }>>,
      this.fileStorage.scanStatuses(
        profiles.flatMap((profile) =>
          profile.resumePath ? [profile.resumePath] : [],
        ),
      ),
    ]);
    const resumeCreditsUsed = Number(usage[0]?.used ?? 0);
    const unlockedCandidates = new Set(
      (usage[0]?.candidateIds ?? []).map(Number),
    );
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.candidate_directory_searched",
      targetType: "employer_organization",
      targetId: context.organization.id,
      details: {
        page,
        resultCount: profiles.length,
        total,
        hasQuery: Boolean(searchTerm),
      },
    });
    return {
      items: profiles.map((profile) => ({
        candidateId: profile.userId,
        displayName: profile.user.displayName,
        headline: profile.headline,
        location: profile.location,
        summary: profile.summary,
        skills: this.parseCandidateSkills(profile.skills),
        experience: profile.experience,
        education: profile.education,
        certifications: profile.certifications,
        resumeScanStatus: profile.resumePath
          ? (resumeScanStatuses.get(profile.resumePath) ?? "pending")
          : null,
        profileBoosted:
          profile.premiumBoostUntil !== null &&
          profile.premiumBoostUntil.getTime() > Date.now(),
        resumeAccessAvailable: Boolean(
          profile.resumePath &&
          profile.allowRecruiterResumeAccess &&
          resumeScanStatuses.get(profile.resumePath) === "clean",
        ),
        resumeAlreadyUnlocked: unlockedCandidates.has(profile.userId),
        ...(profile.allowRecruiterContact
          ? {
              email: profile.user.email,
              ...(profile.user.phoneVerified && profile.user.phoneE164
                ? { phone: profile.user.phoneE164 }
                : {}),
            }
          : {}),
      })),
      total,
      page,
      limit,
      resumeCredits: {
        monthlyLimit: entitlements.resumeCredits,
        used: resumeCreditsUsed,
        remaining: Math.max(0, entitlements.resumeCredits - resumeCreditsUsed),
      },
    };
  }

  async unlockCandidateResume(
    user: AuthenticatedUser,
    candidateId: number,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const profile = await this.candidateProfiles
      .createQueryBuilder("profile")
      .innerJoinAndSelect("profile.user", "candidate")
      .where("profile.userId = :candidateId", { candidateId })
      .andWhere("profile.profileVisibility = :visibility", {
        visibility: "recruiters",
      })
      .andWhere("profile.allowRecruiterResumeAccess = true")
      .andWhere("profile.resumePath IS NOT NULL")
      .andWhere("candidate.role = :role AND candidate.isActive = true", {
        role: UserRole.CANDIDATE,
      })
      .getOne();
    if (!profile?.resumePath)
      throw new NotFoundException("This candidate has not shared a resume.");

    const signedUrl = await this.fileStorage.createSignedUrl(
      profile.resumePath,
    );
    const periodKey = this.currentResumeCreditPeriod();
    const newlyUnlocked = await this.dataSource.transaction(async (manager) => {
      const organization = await manager
        .getRepository(EmployerOrganization)
        .findOne({
          where: { id: context.organization.id },
          lock: { mode: "pessimistic_write" },
        });
      if (!organization)
        throw new NotFoundException("Company workspace was not found.");

      const currentProfile = (await manager.query(
        `SELECT profile.resume_path AS "resumePath"
         FROM candidate_profiles profile
         INNER JOIN users candidate ON candidate.id = profile.user_id
         WHERE profile.user_id = $1
           AND profile.profile_visibility = 'recruiters'
           AND profile.allow_recruiter_resume_access = true
           AND candidate.role = $2
           AND candidate.is_active = true`,
        [candidateId, UserRole.CANDIDATE],
      )) as Array<{ resumePath: string | null }>;
      if (
        !currentProfile[0]?.resumePath ||
        currentProfile[0].resumePath !== profile.resumePath
      )
        throw new NotFoundException("This candidate has not shared a resume.");

      const existing = (await manager.query(
        `SELECT id
         FROM employer_candidate_resume_unlocks
         WHERE organization_id = $1 AND candidate_user_id = $2 AND period_key = $3`,
        [organization.id, candidateId, periodKey],
      )) as Array<{ id: number }>;
      if (existing.length) return false;

      const entitlements = await this.limitsFor(organization);
      if (entitlements.resumeCredits < 1)
        throw new ForbiddenException(
          "Resume database access is not included in this plan.",
        );
      const usage = (await manager.query(
        `SELECT COUNT(*)::int AS used
         FROM employer_candidate_resume_unlocks
         WHERE organization_id = $1 AND period_key = $2`,
        [organization.id, periodKey],
      )) as Array<{ used: number | string }>;
      if (Number(usage[0]?.used ?? 0) >= entitlements.resumeCredits)
        throw new ForbiddenException(
          "Your plan's monthly resume unlock credits are used. Upgrade or wait for the next billing month.",
        );
      const inserted = (await manager.query(
        `INSERT INTO employer_candidate_resume_unlocks
           (organization_id, candidate_user_id, unlocked_by_user_id, period_key)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, candidate_user_id, period_key) DO NOTHING
         RETURNING id`,
        [organization.id, candidateId, user.id, periodKey],
      )) as Array<{ id: number }>;
      if (!inserted.length) return false;
      await manager.query(
        `INSERT INTO employer_resume_credit_events (
           source_unlock_id, organization_id, candidate_user_id,
           actor_user_id, event_type, period_key, plan_key, credit_limit
         )
         VALUES ($1, $2, $3, $4, 'unlock', $5, $6, $7)
         ON CONFLICT (source_unlock_id) DO NOTHING`,
        [
          inserted[0].id,
          organization.id,
          candidateId,
          user.id,
          periodKey,
          organization.planKey,
          entitlements.resumeCredits,
        ],
      );
      return true;
    });

    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.candidate_resume_accessed",
      targetType: "candidate",
      targetId: candidateId,
      details: {
        organizationId: context.organization.id,
        periodKey,
        newlyUnlocked,
      },
    });
    return { resumeUrl: signedUrl, newlyUnlocked, periodKey };
  }

  async listCandidateSearches(
    user: AuthenticatedUser,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    return this.employerSavedSearches.find({
      where: [
        { userId: user.id, organizationId: context.organization.id },
        { isShared: true, organizationId: context.organization.id },
      ],
      order: { createdAt: "DESC" },
      take: 50,
    });
  }

  async saveCandidateSearch(
    user: AuthenticatedUser,
    dto: CreateEmployerSavedSearchDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const name = dto.name.trim();
    const query = dto.query.trim();
    if (!name || !query)
      throw new BadRequestException("Enter a name and a search expression.");
    compileCandidateSearchQuery(query);
    try {
      const search = await this.employerSavedSearches.save(
        this.employerSavedSearches.create({
          organizationId: context.organization.id,
          userId: user.id,
          name,
          query,
          isShared: dto.shareWithTeam === true,
        }),
      );
      await this.auditService.record({
        actorUserId: user.id,
        action: "employer.candidate_search_saved",
        targetType: "employer_saved_candidate_search",
        targetId: search.id,
        details: { organizationId: context.organization.id },
      });
      return search;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        error.driverError?.code === "23505"
      )
        throw new ConflictException(
          "A saved candidate search with this name already exists.",
        );
      throw error;
    }
  }

  async updateCandidateSearch(
    user: AuthenticatedUser,
    searchId: number,
    dto: UpdateEmployerSavedSearchDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    if (
      dto.name === undefined &&
      dto.query === undefined &&
      dto.shareWithTeam === undefined
    ) {
      throw new BadRequestException("Change at least one saved-search field.");
    }
    const saved = await this.employerSavedSearches.findOneBy({
      id: searchId,
      userId: user.id,
      organizationId: context.organization.id,
    });
    if (!saved)
      throw new NotFoundException("Saved candidate search was not found.");
    const name = dto.name === undefined ? saved.name : dto.name.trim();
    const query = dto.query === undefined ? saved.query : dto.query.trim();
    if (!name || !query)
      throw new BadRequestException("Enter a name and a search expression.");
    compileCandidateSearchQuery(query);
    saved.name = name;
    saved.query = query;
    if (dto.shareWithTeam !== undefined) saved.isShared = dto.shareWithTeam;
    try {
      const updated = await this.employerSavedSearches.save(saved);
      await this.auditService.record({
        actorUserId: user.id,
        action: "employer.candidate_search_updated",
        targetType: "employer_saved_candidate_search",
        targetId: updated.id,
        details: {
          organizationId: context.organization.id,
          isShared: updated.isShared,
        },
      });
      return updated;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        error.driverError?.code === "23505"
      )
        throw new ConflictException(
          "A saved candidate search with this name already exists.",
        );
      throw error;
    }
  }

  async deleteCandidateSearch(
    user: AuthenticatedUser,
    searchId: number,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const result = await this.employerSavedSearches.delete({
      id: searchId,
      userId: user.id,
      organizationId: context.organization.id,
    });
    if (!result.affected)
      throw new NotFoundException("Saved candidate search was not found.");
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.candidate_search_deleted",
      targetType: "employer_saved_candidate_search",
      targetId: searchId,
      details: { organizationId: context.organization.id },
    });
    return { success: true };
  }

  private parseCandidateSkills(value: string): string[] {
    const parsed: unknown = JSON.parse(value || "[]");
    if (
      !Array.isArray(parsed) ||
      parsed.some((skill) => typeof skill !== "string")
    ) {
      throw new Error("Stored candidate skills have an invalid format");
    }
    return parsed;
  }

  async updateApplicationStatus(
    user: AuthenticatedUser,
    applicationId: number,
    status: string,
    note?: string,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const application = await this.applications
      .createQueryBuilder("application")
      .innerJoin("application.job", "job")
      .where("application.id = :applicationId", { applicationId })
      .andWhere("job.organizationId = :organizationId", {
        organizationId: context.organization.id,
      })
      .getOne();
    if (!application) throw new NotFoundException("Application was not found");
    const result = await this.applicationsService.updateStatus(
      user,
      applicationId,
      status,
      note,
      context.organization.id,
    );
    return result;
  }

  async assignApplication(
    user: AuthenticatedUser,
    applicationId: number,
    assigneeUserId: number | null,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const application = await this.applications
      .createQueryBuilder("application")
      .innerJoinAndSelect("application.job", "job")
      .leftJoinAndSelect("application.assignedTo", "assignee")
      .where("application.id = :applicationId", { applicationId })
      .andWhere("job.organizationId = :organizationId", {
        organizationId: context.organization.id,
      })
      .getOne();
    if (!application) {
      throw new NotFoundException("Application was not found");
    }

    let assigneeName: string | null = null;
    if (assigneeUserId !== null) {
      const membership = await this.members.findOne({
        where: {
          organizationId: context.organization.id,
          userId: assigneeUserId,
          status: "active",
        },
        relations: { user: true },
      });
      if (
        !membership ||
        !APPLICATION_MANAGERS.includes(membership.role) ||
        !membership.user?.isActive
      ) {
        throw new BadRequestException(
          "Choose an active hiring-team member in this company.",
        );
      }
      assigneeName = membership.user.displayName;
    }

    const previousAssigneeUserId = application.assignedToUserId;
    application.assignedToUserId = assigneeUserId;
    await this.applications.save(application);
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.application_assigned",
      targetType: "application",
      targetId: application.id,
      details: {
        organizationId: context.organization.id,
        previousAssigneeUserId,
        assigneeUserId,
      },
    });
    return {
      applicationId: application.id,
      assigneeUserId,
      assigneeName,
    };
  }

  async createApplicationOffer(
    user: AuthenticatedUser,
    applicationId: number,
    dto: CreateEmployerOfferDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const applicationStages = (await this.platformConfiguration.get())
      .applicationStages;
    const termsSummary = dto.termsSummary.trim();
    if (!termsSummary) {
      throw new BadRequestException("Enter the offer details before sending.");
    }
    const expiresAt = new Date(dto.expiresAt);
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException("Offer expiry must be in the future.");
    }
    const result = await this.dataSource.transaction(async (manager) => {
      const applications = manager.getRepository(CandidateApplication);
      const application = await applications
        .createQueryBuilder("application")
        .innerJoinAndSelect("application.job", "job")
        .where("application.id = :applicationId", { applicationId })
        .andWhere("job.organizationId = :organizationId", {
          organizationId: context.organization.id,
        })
        .setLock("pessimistic_write")
        .getOne();
      if (!application)
        throw new NotFoundException("Application was not found.");
      if (
        !applicationStages.some(
          (stage) =>
            stage.key === application.status &&
            (stage.key === "interview" ||
              stage.transitions.includes("interview")),
        )
      ) {
        throw new BadRequestException(
          "An offer can only be made to an application that is being considered.",
        );
      }
      const offerRepository = manager.getRepository(CandidateApplicationOffer);
      const existing = await offerRepository.findOneBy({ applicationId });
      if (existing) {
        throw new BadRequestException(
          "An offer has already been created for this application.",
        );
      }
      const offer = await offerRepository.save(
        offerRepository.create({
          applicationId,
          termsSummary,
          expiresAt,
          status: "pending",
          respondedAt: null,
        }),
      );
      const previousStatus = application.status;
      application.status = "offer";
      await applications.save(application);
      await manager.getRepository(CandidateApplicationStatus).save({
        applicationId,
        fromStatus: previousStatus,
        toStatus: "offer",
        note: "An offer was sent to the candidate.",
        changedByUserId: user.id,
      });
      await manager.getRepository(UserNotification).save(
        manager.getRepository(UserNotification).create({
          userId: application.userId,
          type: "application_offer",
          title: "You received a job offer",
          message: `The hiring team sent you an offer for ${application.job.title}. Review and respond before it expires.`,
          link: "/#dashboard/applications",
          readAt: null,
        }),
      );
      return offer;
    });
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.application_offer_created",
      targetType: "application",
      targetId: applicationId,
      details: {
        organizationId: context.organization.id,
        expiresAt: expiresAt.toISOString(),
      },
    });
    return result;
  }

  async resolveWithdrawalRequest(
    user: AuthenticatedUser,
    applicationId: number,
    dto: ResolveCandidateWithdrawalDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const result = await this.dataSource.transaction(async (manager) => {
      const applications = manager.getRepository(CandidateApplication);
      const application = await applications
        .createQueryBuilder("application")
        .innerJoinAndSelect("application.job", "job")
        .where("application.id = :applicationId", { applicationId })
        .andWhere("job.organizationId = :organizationId", {
          organizationId: context.organization.id,
        })
        .setLock("pessimistic_write")
        .getOne();
      if (!application)
        throw new NotFoundException("Application was not found.");
      if (application.status !== "withdrawal_requested") {
        throw new BadRequestException(
          "This application has no pending withdrawal request.",
        );
      }
      const previousStatus = application.withdrawalRequestedFromStatus;
      if (!previousStatus) {
        throw new BadRequestException(
          "The prior application stage is missing; contact support.",
        );
      }
      application.status =
        dto.decision === "approve" ? "withdrawn" : previousStatus;
      application.withdrawnAt = dto.decision === "approve" ? new Date() : null;
      application.withdrawalRequestedAt = null;
      application.withdrawalRequestedFromStatus = null;
      await applications.save(application);
      if (dto.decision === "approve") {
        const offerRepository = manager.getRepository(
          CandidateApplicationOffer,
        );
        const offer = await offerRepository.findOneBy({ applicationId });
        if (offer?.status === "pending") {
          offer.status = "withdrawn";
          await offerRepository.save(offer);
        }
      }
      await manager.getRepository(CandidateApplicationStatus).save({
        applicationId,
        fromStatus: "withdrawal_requested",
        toStatus: application.status,
        note:
          dto.note?.trim() ||
          (dto.decision === "approve"
            ? "Employer confirmed the candidate's withdrawal request."
            : "Employer declined the candidate's withdrawal request."),
        changedByUserId: user.id,
      });
      await manager.getRepository(UserNotification).save(
        manager.getRepository(UserNotification).create({
          userId: application.userId,
          type: `withdrawal_${dto.decision === "approve" ? "confirmed" : "declined"}`,
          title:
            dto.decision === "approve"
              ? "Withdrawal confirmed"
              : "Withdrawal request declined",
          message:
            dto.decision === "approve"
              ? `Your application for ${application.job.title} has been withdrawn. You may apply again while the job remains open.`
              : `Your withdrawal request for ${application.job.title} was declined.${dto.note?.trim() ? ` Note: ${dto.note.trim()}` : ""}`,
          link: "/#dashboard/applications",
          readAt: null,
        }),
      );
      return application.status;
    });
    await this.auditService.record({
      actorUserId: user.id,
      action: `employer.application_withdrawal_${dto.decision}d`,
      targetType: "application",
      targetId: applicationId,
      details: { organizationId: context.organization.id },
    });
    return { applicationId, status: result };
  }

  async listApplicationMessages(
    user: AuthenticatedUser,
    applicationId: number,
    requestedPage = 1,
    requestedLimit = 25,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    await this.assertApplicationBelongsToOrganization(
      applicationId,
      context.organization.id,
    );
    const page = Math.max(1, requestedPage);
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const [items, total] = await this.messages.findAndCount({
      where: { applicationId },
      relations: { sender: true },
      order: { createdAt: "DESC", id: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.reverse().map((message) => ({
        id: message.id,
        message: message.message,
        senderUserId: message.senderUserId,
        senderName: message.sender.displayName,
        createdAt: message.createdAt,
      })),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  async sendApplicationMessage(
    user: AuthenticatedUser,
    applicationId: number,
    dto: { message: string },
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const messageText = dto.message.trim();
    if (!messageText) {
      throw new BadRequestException("Write a message before sending it.");
    }
    const application = await this.getApplicationWithCandidate(
      applicationId,
      context.organization.id,
    );
    const message = await this.dataSource.transaction(async (manager) => {
      const messages = manager.getRepository(CandidateApplicationMessage);
      const savedMessage = await messages.save(
        messages.create({
          applicationId,
          senderUserId: user.id,
          message: messageText,
        }),
      );
      const notifications = manager.getRepository(UserNotification);
      await notifications.save(
        notifications.create({
          userId: application.userId,
          type: "application_message",
          title: "New message from the hiring team",
          message: `The hiring team sent you a message about ${application.job.title}.`,
          link: "/#dashboard/applications",
          readAt: null,
        }),
      );
      await this.auditService.record(
        {
          actorUserId: user.id,
          action: "employer.application_message_sent",
          targetType: "application",
          targetId: applicationId,
          details: { organizationId: context.organization.id },
        },
        manager,
      );
      return savedMessage;
    });
    return {
      id: message.id,
      message: message.message,
      senderUserId: user.id,
      senderName: user.displayName,
      createdAt: message.createdAt,
    };
  }

  async addApplicationNote(
    user: AuthenticatedUser,
    applicationId: number,
    dto: CreateEmployerNoteDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    await this.assertApplicationBelongsToOrganization(
      applicationId,
      context.organization.id,
    );
    const noteText = dto.note.trim();
    if (!noteText)
      throw new BadRequestException("Write a note before saving it.");
    const note = await this.notes.save(
      this.notes.create({
        organizationId: context.organization.id,
        applicationId,
        authorUserId: user.id,
        note: noteText,
      }),
    );
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.application_note_added",
      targetType: "application",
      targetId: applicationId,
      details: {
        organizationId: context.organization.id,
        noteId: note.id,
      },
    });
    return {
      id: note.id,
      note: note.note,
      author: user.displayName,
      createdAt: note.createdAt,
    };
  }

  async addApplicationTag(
    user: AuthenticatedUser,
    applicationId: number,
    label: string,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    await this.assertApplicationBelongsToOrganization(
      applicationId,
      context.organization.id,
    );
    const normalized = label.trim().toLowerCase();
    if (!normalized) throw new BadRequestException("Enter a non-blank tag.");
    const existing = await this.tags.findOneBy({
      organizationId: context.organization.id,
      applicationId,
      label: normalized,
    });
    if (existing) return { id: existing.id, label: existing.label };
    const tag = await this.tags.save(
      this.tags.create({
        organizationId: context.organization.id,
        applicationId,
        label: normalized,
        createdByUserId: user.id,
      }),
    );
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.application_tag_added",
      targetType: "application",
      targetId: applicationId,
      details: { organizationId: context.organization.id, tagId: tag.id },
    });
    return { id: tag.id, label: tag.label };
  }

  async removeApplicationTag(
    user: AuthenticatedUser,
    applicationId: number,
    tagId: number,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const result = await this.tags.delete({
      id: tagId,
      applicationId,
      organizationId: context.organization.id,
    });
    if (!result.affected) throw new NotFoundException("Tag was not found");
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.application_tag_removed",
      targetType: "application",
      targetId: applicationId,
      details: { organizationId: context.organization.id, tagId },
    });
    return { success: true };
  }

  async createInterview(
    user: AuthenticatedUser,
    applicationId: number,
    dto: CreateEmployerInterviewDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const applicationStages = (await this.platformConfiguration.get())
      .applicationStages;
    const startsAt = new Date(dto.startsAt);
    if (
      !Number.isFinite(startsAt.getTime()) ||
      startsAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException("Choose an interview time in the future.");
    }
    const interviewerUserId = dto.interviewerUserId ?? user.id;
    const interviewer = await this.members.findOne({
      where: {
        organizationId: context.organization.id,
        userId: interviewerUserId,
        status: "active",
      },
      relations: { user: true },
    });
    if (
      !interviewer ||
      !interviewer.user?.isActive ||
      !APPLICATION_MANAGERS.includes(interviewer.role)
    ) {
      throw new BadRequestException(
        "Choose an active hiring-team member as the interviewer.",
      );
    }
    const { application, interview } = await this.dataSource.transaction(
      async (manager) => {
        const application = await manager
          .getRepository(CandidateApplication)
          .createQueryBuilder("application")
          .innerJoinAndSelect("application.job", "job")
          .innerJoinAndSelect("application.user", "candidate")
          .where("application.id = :applicationId", { applicationId })
          .andWhere("job.organizationId = :organizationId", {
            organizationId: context.organization.id,
          })
          .setLock("pessimistic_write")
          .getOne();
        if (!application)
          throw new NotFoundException("Application was not found.");
        const currentStage = applicationStages.find(
          (stage) => stage.key === application.status,
        );
        if (
          !currentStage ||
          (application.status !== "interview" &&
            !currentStage.transitions.includes("interview"))
        )
          throw new BadRequestException(
            `An interview cannot be scheduled for an application in the ${application.status} stage.`,
          );
        await manager.query(
          "SELECT id FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE",
          [[application.userId, interviewerUserId]],
        );
        await this.assertNoInterviewConflict(
          manager,
          application.userId,
          interviewerUserId,
          startsAt,
          dto.durationMinutes ?? 30,
        );
        const interview = await manager.getRepository(EmployerInterview).save({
          organizationId: context.organization.id,
          applicationId,
          scheduledByUserId: user.id,
          interviewerUserId,
          startsAt,
          durationMinutes: dto.durationMinutes ?? 30,
          location: dto.location?.trim() || null,
          meetingUrl: dto.meetingUrl?.trim() || null,
          notes: dto.notes?.trim() || null,
          status: "scheduled",
        });
        if (["submitted", "in_review"].includes(application.status)) {
          const previousStatus = application.status;
          application.status = "interview";
          await manager.getRepository(CandidateApplication).save(application);
          await manager.getRepository(CandidateApplicationStatus).save({
            applicationId,
            fromStatus: previousStatus,
            toStatus: "interview",
            note: "Application moved to Interview when the interview was scheduled.",
            changedByUserId: user.id,
          });
        }
        return { application, interview };
      },
    );
    let googleCalendarStatus: "created" | "disabled" | "failed" = "disabled";
    {
      const calendar = await this.googleCalendar.createInterviewEvent({
        title: `${context.organization.name}: ${application.job.title} interview`,
        description: `Interview for ${application.job.title} at ${context.organization.name}.`,
        attendeeEmails: [
          application.user.email,
          interviewer.user.email,
        ].filter((email): email is string => Boolean(email)),
        startsAt,
        durationMinutes: dto.durationMinutes ?? 30,
      });
      googleCalendarStatus = calendar.calendarStatus;
      if (calendar.meetingUrl && !interview.meetingUrl) {
        interview.meetingUrl = calendar.meetingUrl;
      }
      if (calendar.calendarEventId) {
        interview.calendarEventId = calendar.calendarEventId;
        await this.interviews.save(interview);
      }
    }
    let notificationStatus: "queued" | "disabled" | "failed" = "disabled";
    const candidateProfile = await this.dataSource
      .getRepository(CandidateProfile)
      .findOneBy({ userId: application.userId });
    if (candidateProfile?.applicationEmailUpdates ?? true) {
      try {
        await this.emailDelivery.sendNotification(
          application.user.email,
          `Interview invitation: ${application.job.title}`,
          `The hiring team at ${context.organization.name} scheduled an interview for ${application.job.title} on ${startsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.${interview.meetingUrl ? ` Join here: ${interview.meetingUrl}` : ""}${interview.location ? ` Location: ${interview.location}` : ""}`,
          `interview-scheduled:${interview.id}`,
          "interview_scheduled",
          {
            organizationName: context.organization.name,
            jobTitle: application.job.title,
            startsAt: startsAt.toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            }),
            meetingUrl: interview.meetingUrl
              ? ` Join here: ${interview.meetingUrl}`
              : "",
            location: interview.location
              ? ` Location: ${interview.location}`
              : "",
          },
          {
            userId: application.userId,
            category: "interview_reminder",
          },
        );
        notificationStatus = "queued";
      } catch (error) {
        notificationStatus = "failed";
        this.logger.error(
          `Interview ${interview.id} was saved but its invitation email could not be queued: ${
            error instanceof Error ? error.message : "unknown email error"
          }`,
        );
      }
    }
    let inAppNotificationStatus: "created" | "failed" = "created";
    try {
      await this.addNotification(
        application.userId,
        "interview_scheduled",
        "Interview scheduled",
        `An interview was scheduled for ${application.job.title}. Your application is now in the Interview stage.`,
        "/#dashboard/applications",
      );
    } catch (error) {
      inAppNotificationStatus = "failed";
      this.logger.error(
        `Interview ${interview.id} was saved but its in-app notification could not be created: ${
          error instanceof Error ? error.message : "unknown notification error"
        }`,
      );
    }
    let auditStatus: "recorded" | "failed" = "recorded";
    try {
      await this.auditService.record({
        actorUserId: user.id,
        action: "employer.interview_scheduled",
        targetType: "interview",
        targetId: interview.id,
        details: {
          organizationId: context.organization.id,
          applicationId,
          startsAt: startsAt.toISOString(),
          durationMinutes: interview.durationMinutes,
          interviewerUserId,
          notificationStatus,
          inAppNotificationStatus,
          googleCalendarStatus,
        },
      });
    } catch (error) {
      auditStatus = "failed";
      this.logger.error(
        `Interview ${interview.id} was saved but its audit event could not be recorded: ${
          error instanceof Error ? error.message : "unknown audit error"
        }`,
      );
    }
    return {
      ...interview,
      notificationStatus,
      inAppNotificationStatus,
      auditStatus,
      googleCalendarStatus,
    };
  }

  async cancelInterview(
    user: AuthenticatedUser,
    interviewId: number,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const interview = await this.interviews.findOneBy({
      id: interviewId,
      organizationId: context.organization.id,
    });
    if (!interview) throw new NotFoundException("Interview was not found");
    if (interview.status !== "scheduled")
      throw new ConflictException("Only scheduled interviews can be cancelled.");
    interview.status = "cancelled";
    const saved = await this.interviews.save(interview);
    let calendarStatus: "deleted" | "disabled" | "failed" = "disabled";
    if (saved.calendarEventId) {
      try {
        await this.googleCalendar.deleteInterviewEvent(saved.calendarEventId);
        calendarStatus = "deleted";
      } catch (error) {
        calendarStatus = "failed";
        this.logger.error(
          `Interview ${saved.id} was cancelled but its calendar event could not be removed: ${
            error instanceof Error ? error.message : "unknown calendar error"
          }`,
        );
      }
    }
    const application = await this.getApplicationWithCandidate(
      interview.applicationId,
      context.organization.id,
    );
    let notificationStatus: "queued" | "disabled" | "failed" = "disabled";
    const candidateProfile = await this.dataSource
      .getRepository(CandidateProfile)
      .findOneBy({ userId: application.userId });
    if (candidateProfile?.applicationEmailUpdates ?? true) {
      try {
        await this.emailDelivery.sendNotification(
          application.user.email,
          `Interview cancelled: ${application.job.title}`,
          `The interview for ${application.job.title} at ${context.organization.name} has been cancelled. Contact the hiring team if you need more information.`,
          `interview-cancelled:${interview.id}`,
          "interview_cancelled",
          {
            jobTitle: application.job.title,
            company: context.organization.name,
          },
          {
            userId: application.userId,
            category: "interview_reminder",
          },
        );
        notificationStatus = "queued";
      } catch (error) {
        notificationStatus = "failed";
        this.logger.error(
          `Interview ${interview.id} was cancelled but the candidate notification could not be queued: ${
            error instanceof Error ? error.message : "unknown email error"
          }`,
        );
      }
    }
    let inAppNotificationStatus: "created" | "failed" = "created";
    try {
      await this.addNotification(
        application.userId,
        "interview_cancelled",
        "Interview cancelled",
        `The interview for ${application.job.title} was cancelled.`,
        "/#dashboard/notifications",
      );
    } catch (error) {
      inAppNotificationStatus = "failed";
      this.logger.error(
        `Interview ${saved.id} was cancelled but its in-app notification could not be created: ${
          error instanceof Error ? error.message : "unknown notification error"
        }`,
      );
    }
    let auditStatus: "recorded" | "failed" = "recorded";
    try {
      await this.auditService.record({
        actorUserId: user.id,
        action: "employer.interview_cancelled",
        targetType: "interview",
        targetId: saved.id,
        details: {
          organizationId: context.organization.id,
          applicationId: interview.applicationId,
          notificationStatus,
          calendarStatus,
        },
      });
    } catch (error) {
      auditStatus = "failed";
      this.logger.error(
        `Interview ${saved.id} was cancelled but its audit event could not be recorded: ${
          error instanceof Error ? error.message : "unknown audit error"
        }`,
      );
    }
    return {
      ...saved,
      notificationStatus,
      inAppNotificationStatus,
      calendarStatus,
      auditStatus,
    };
  }

  async rescheduleInterview(
    user: AuthenticatedUser,
    interviewId: number,
    dto: UpdateEmployerInterviewDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const startsAt = new Date(dto.startsAt);
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date())
      throw new BadRequestException("Choose an interview time in the future.");
    const interview = await this.interviews.findOne({
      where: { id: interviewId, organizationId: context.organization.id },
      relations: { application: { job: true, user: true } },
    });
    if (!interview) throw new NotFoundException("Interview was not found.");
    if (interview.status !== "scheduled")
      throw new ConflictException("Only scheduled interviews can be changed.");
    const interviewerUserId =
      dto.interviewerUserId ?? interview.interviewerUserId;
    const interviewer = interviewerUserId
      ? await this.members.findOne({
          where: {
            organizationId: context.organization.id,
            userId: interviewerUserId,
            status: "active",
          },
          relations: { user: true },
        })
      : null;
    if (
      interviewerUserId &&
      (!interviewer ||
        !interviewer.user?.isActive ||
        !APPLICATION_MANAGERS.includes(interviewer.role))
    )
      throw new BadRequestException(
        "Choose an active hiring-team member as the interviewer.",
      );
    const durationMinutes = dto.durationMinutes ?? interview.durationMinutes;
    const saved = await this.dataSource.transaction(async (manager) => {
      const current = await manager.getRepository(EmployerInterview).findOne({
        where: { id: interviewId, organizationId: context.organization.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!current) throw new NotFoundException("Interview was not found.");
      if (current.status !== "scheduled")
        throw new ConflictException("Only scheduled interviews can be changed.");
      const userIds = [
        interview.application.userId,
        ...(interviewerUserId ? [interviewerUserId] : []),
      ];
      await manager.query(
        "SELECT id FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE",
        [userIds],
      );
      await this.assertNoInterviewConflict(
        manager,
        interview.application.userId,
        interviewerUserId,
        startsAt,
        durationMinutes,
        interviewId,
      );
      current.startsAt = startsAt;
      current.durationMinutes = durationMinutes;
      current.interviewerUserId = interviewerUserId;
      if (dto.location !== undefined)
        current.location = dto.location.trim() || null;
      if (dto.meetingUrl !== undefined)
        current.meetingUrl = dto.meetingUrl.trim() || null;
      current.candidateResponse = "pending";
      current.candidateResponseNote = null;
      current.candidateResponseAt = null;
      return manager.getRepository(EmployerInterview).save(current);
    });

    let calendarStatus: "updated" | "disabled" | "failed" = "disabled";
    if (saved.calendarEventId) {
      calendarStatus = await this.googleCalendar.updateInterviewEvent(
        saved.calendarEventId,
        startsAt,
        durationMinutes,
        [
          interview.application.user.email,
          ...(interviewer?.user?.email ? [interviewer.user.email] : []),
        ],
      );
    }
    let notificationStatus: "queued" | "disabled" | "failed" = "disabled";
    const candidateProfile = await this.candidateProfiles.findOneBy({
      userId: interview.application.userId,
    });
    if (candidateProfile?.applicationEmailUpdates ?? true) {
      try {
        await this.emailDelivery.sendNotification(
          interview.application.user.email,
          `Interview rescheduled: ${interview.application.job.title}`,
          `The hiring team at ${context.organization.name} rescheduled your interview for ${startsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.${saved.meetingUrl ? ` Join here: ${saved.meetingUrl}` : ""}${saved.location ? ` Location: ${saved.location}` : ""}`,
          `interview-rescheduled:${saved.id}:${startsAt.getTime()}`,
          "interview_scheduled",
          {
            organizationName: context.organization.name,
            jobTitle: interview.application.job.title,
            startsAt: `${startsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
            meetingUrl: saved.meetingUrl ? ` Join here: ${saved.meetingUrl}` : "",
            location: saved.location ? ` Location: ${saved.location}` : "",
          },
          {
            userId: interview.application.userId,
            category: "interview_reminder",
          },
        );
        notificationStatus = "queued";
      } catch (error) {
        notificationStatus = "failed";
        this.logger.error(
          `Interview ${saved.id} was rescheduled but its email could not be queued: ${
            error instanceof Error ? error.message : "unknown email error"
          }`,
        );
      }
    }
    try {
      await this.addNotification(
        interview.application.userId,
        "interview_rescheduled",
        "Interview rescheduled",
        `Your interview for ${interview.application.job.title} was rescheduled. Review the updated time in your interview schedule.`,
        "/#dashboard/interviews",
      );
    } catch (error) {
      this.logger.error(
        `Interview ${saved.id} was rescheduled but its in-app notification could not be created: ${
          error instanceof Error ? error.message : "unknown notification error"
        }`,
      );
    }
    try {
      await this.auditService.record({
        actorUserId: user.id,
        action: "employer.interview_rescheduled",
        targetType: "interview",
        targetId: saved.id,
        details: {
          organizationId: context.organization.id,
          startsAt: startsAt.toISOString(),
          interviewerUserId,
          notificationStatus,
          calendarStatus,
        },
      });
    } catch (error) {
      this.logger.error(
        `Interview ${saved.id} was rescheduled but its audit event could not be recorded: ${
          error instanceof Error ? error.message : "unknown audit error"
        }`,
      );
    }
    return { ...saved, notificationStatus, calendarStatus };
  }

  async completeInterview(
    user: AuthenticatedUser,
    interviewId: number,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const interview = await this.interviews.findOneBy({
      id: interviewId,
      organizationId: context.organization.id,
    });
    if (!interview) throw new NotFoundException("Interview was not found.");
    if (interview.status !== "scheduled")
      throw new ConflictException("Only scheduled interviews can be completed.");
    if (interview.startsAt > new Date())
      throw new BadRequestException(
        "An interview cannot be completed before its scheduled start time.",
      );
    interview.status = "completed";
    const saved = await this.interviews.save(interview);
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.interview_completed",
      targetType: "interview",
      targetId: saved.id,
      details: { organizationId: context.organization.id },
    });
    return saved;
  }

  async saveInterviewFeedback(
    user: AuthenticatedUser,
    interviewId: number,
    dto: EmployerInterviewFeedbackDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    const interview = await this.interviews.findOneBy({
      id: interviewId,
      organizationId: context.organization.id,
    });
    if (!interview) throw new NotFoundException("Interview was not found.");
    if (interview.status !== "completed")
      throw new ConflictException(
        "Evaluator feedback can be saved after the interview is completed.",
      );
    if (
      interview.interviewerUserId &&
      interview.interviewerUserId !== user.id &&
      ![OrganizationMemberRole.OWNER, OrganizationMemberRole.ADMIN].includes(
        context.membership.role,
      )
    )
      throw new ForbiddenException(
        "Only the assigned interviewer or a company admin can submit this feedback.",
      );
    const scoreEntries = Object.entries(dto.scores ?? {});
    if (
      scoreEntries.length < 1 ||
      scoreEntries.length > 10 ||
      scoreEntries.some(
        ([criterion, score]) =>
          !criterion.trim() ||
          criterion.length > 80 ||
          !Number.isInteger(score) ||
          score < 1 ||
          score > 5,
      )
    )
      throw new BadRequestException(
        "Provide 1 to 10 score criteria with integer ratings from 1 to 5.",
      );
    const existing = await this.interviewFeedback.findOneBy({
      interviewId,
      reviewerUserId: user.id,
    });
    const feedback = this.interviewFeedback.create({
      ...(existing ?? {}),
      interviewId,
      organizationId: context.organization.id,
      reviewerUserId: user.id,
      scores: Object.fromEntries(
        scoreEntries.map(([criterion, score]) => [criterion.trim(), score]),
      ),
      recommendation: dto.recommendation,
      notes: dto.notes?.trim() || null,
    });
    const saved = await this.interviewFeedback.save(feedback);
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.interview_feedback_saved",
      targetType: "interview",
      targetId: interviewId,
      details: { organizationId: context.organization.id, feedbackId: saved.id },
    });
    return saved;
  }

  async listInterviews(
    user: AuthenticatedUser,
    page = 1,
    limit = 25,
    organizationId?: number,
  ) {
    const { organization } = await this.getContext(user.id, organizationId);
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [items, total] = await this.interviews.findAndCount({
      where: {
        organizationId: organization.id,
        status: "scheduled",
      },
      relations: { application: { job: true, user: true }, interviewer: true },
      order: { startsAt: "ASC" },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    return {
      items: items.map((interview) => ({
        ...interview,
        candidateName: interview.application.user.displayName,
        candidateEmail: interview.application.user.email,
        jobTitle: interview.application.job.title,
        interviewerName: interview.interviewer?.displayName ?? null,
      })),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async listTeam(user: AuthenticatedUser, organizationId?: number) {
    const context = await this.getContext(user.id, organizationId);
    return this.members
      .find({
        where: { organizationId: context.organization.id },
        relations: { user: true },
        order: { createdAt: "ASC" },
      })
      .then((rows) =>
        rows.map((member) => ({
          id: member.id,
          userId: member.userId,
          email: member.email,
          displayName: member.user?.displayName ?? null,
          role: member.role,
          status:
            member.status === "invited" &&
            member.invitationExpiresAt &&
            member.invitationExpiresAt <= new Date()
              ? "expired"
              : member.status,
          createdAt: member.createdAt,
        })),
      );
  }

  private async assertNoInterviewConflict(
    manager: EntityManager,
    candidateUserId: number,
    interviewerUserId: number | null,
    startsAt: Date,
    durationMinutes: number,
    excludedInterviewId?: number,
  ) {
    const conflicts = (await manager.query(
      `SELECT interview.id
       FROM employer_interviews interview
       INNER JOIN candidate_applications application
         ON application.id = interview.application_id
       WHERE interview.status = 'scheduled'
         AND interview.starts_at < $1::timestamptz + ($2 * INTERVAL '1 minute')
         AND interview.starts_at + (interview.duration_minutes * INTERVAL '1 minute') > $1::timestamptz
         AND (application.user_id = $3
              OR ($4::integer IS NOT NULL AND interview.interviewer_user_id = $4))
         AND ($5::integer IS NULL OR interview.id <> $5)
       LIMIT 1`,
      [
        startsAt,
        durationMinutes,
        candidateUserId,
        interviewerUserId,
        excludedInterviewId ?? null,
      ],
    )) as Array<{ id: number }>;
    if (conflicts.length)
      throw new ConflictException(
        "The candidate or interviewer already has an overlapping interview.",
      );
  }

  async inviteTeamMember(
    user: AuthenticatedUser,
    dto: InviteTeamMemberDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, TEAM_MANAGERS);
    const email = dto.email.trim().toLowerCase();
    if (email === user.email.toLowerCase())
      throw new BadRequestException(
        "You are already a member of this company.",
      );
    const existingUser = await this.users.findOneBy({ email });
    if (
      existingUser &&
      (existingUser.role !== UserRole.EMPLOYER ||
        existingUser.employerApprovalStatus ===
          EmployerApprovalStatus.REJECTED ||
        !existingUser.isActive)
    ) {
      throw new BadRequestException(
        "Team invitations can only be sent to employer accounts. Candidate accounts cannot be converted to employer accounts.",
      );
    }
    const appUrl = process.env.PUBLIC_APP_URL?.trim();
    if (!appUrl)
      throw new ServiceUnavailableException(
        "PUBLIC_APP_URL is required to send company invitations.",
      );
    const employerApprovalRequired = (await this.platformConfiguration.get())
      .employerApprovalRequired;
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const tokenHash = this.hashToken(token);
    const member = await this.dataSource.transaction(async (manager) => {
      const organization = await manager
        .getRepository(EmployerOrganization)
        .findOne({
          where: { id: context.organization.id },
          lock: { mode: "pessimistic_write" },
        });
      if (!organization)
        throw new NotFoundException("Company workspace was not found.");
      const members = manager.getRepository(EmployerOrganizationMember);
      const now = new Date();
      const current = await members.findOne({
        where: { organizationId: organization.id, email },
        lock: { mode: "pessimistic_write" },
      });
      if (current?.status === "active")
        throw new ConflictException(
          "This person is already on the company team.",
        );
      if (
        current?.status === "invited" &&
        current.invitationExpiresAt &&
        current.invitationExpiresAt > now
      )
        throw new ConflictException(
          "A valid invitation has already been sent to this person.",
        );
      const occupiedSeats = await members
        .createQueryBuilder("member")
        .where("member.organizationId = :organizationId", {
          organizationId: organization.id,
        })
        .andWhere(
          "(member.status = 'active' OR (member.status = 'invited' AND member.invitationExpiresAt > :now))",
          { now },
        )
        .getCount();
      const limits = await this.limitsFor(organization);
      if (occupiedSeats >= limits.seats)
        throw new ForbiddenException(
          `Your ${organization.planKey} plan includes ${limits.seats} team seat(s). Upgrade the plan to add another member.`,
        );
      const member = current ?? members.create();
      Object.assign(member, {
        organizationId: organization.id,
        userId: existingUser?.id ?? null,
        email,
        role: dto.role,
        status: "invited" as const,
        invitationTokenHash: tokenHash,
        invitationExpiresAt: expiresAt,
        invitedByUserId: user.id,
      });
      return members.save(member);
    });
    const invitationUrl = this.teamInvitationUrl(appUrl, token, existingUser);
    const invitationMessage = this.teamInvitationMessage(
      context.organization.name,
      dto.role,
      existingUser,
      invitationUrl,
      employerApprovalRequired,
    );
    try {
      await this.emailDelivery.sendNotification(
        email,
        `Invitation to join ${context.organization.name} on esllp`,
        invitationMessage,
        `team-invitation:${member.id}:${tokenHash}`,
        "team_invitation",
        {
          organizationName: context.organization.name,
          invitationMessage,
        },
      );
    } catch (error) {
      await this.members.update(
        { id: member.id, invitationTokenHash: tokenHash },
        {
          status: "removed",
          invitationTokenHash: null,
          invitationExpiresAt: null,
        },
      );
      throw error;
    }
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.team_invited",
      targetType: "employer_organization_member",
      targetId: member.id,
      details: {
        organizationId: context.organization.id,
        email,
        role: dto.role,
      },
    });
    return { id: member.id, email, role: member.role, status: member.status };
  }

  async resendTeamInvite(
    user: AuthenticatedUser,
    memberId: number,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, TEAM_MANAGERS);
    const appUrl = process.env.PUBLIC_APP_URL?.trim();
    if (!appUrl)
      throw new ServiceUnavailableException(
        "PUBLIC_APP_URL is required to send company invitations.",
      );
    const employerApprovalRequired = (await this.platformConfiguration.get())
      .employerApprovalRequired;
    const current = await this.members.findOneBy({
      id: memberId,
      organizationId: context.organization.id,
      status: "invited",
    });
    if (!current)
      throw new NotFoundException("An active invitation was not found.");
    const existingUser = await this.users.findOneBy({ email: current.email });
    if (
      existingUser &&
      (existingUser.role !== UserRole.EMPLOYER ||
        existingUser.employerApprovalStatus ===
          EmployerApprovalStatus.REJECTED ||
        !existingUser.isActive)
    )
      throw new BadRequestException(
        "This invitation cannot be accepted by the account currently registered for that email.",
      );

    const token = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const updated = await this.dataSource.transaction(async (manager) => {
      const member = await manager
        .getRepository(EmployerOrganizationMember)
        .findOne({
          where: {
            id: memberId,
            organizationId: context.organization.id,
            status: "invited",
          },
          lock: { mode: "pessimistic_write" },
        });
      if (!member)
        throw new NotFoundException("An active invitation was not found.");
      const previousTokenHash = member.invitationTokenHash;
      const previousExpiresAt = member.invitationExpiresAt;
      member.invitationTokenHash = tokenHash;
      member.invitationExpiresAt = expiresAt;
      return {
        member: await manager
          .getRepository(EmployerOrganizationMember)
          .save(member),
        previousTokenHash,
        previousExpiresAt,
      };
    });
    const invitationUrl = this.teamInvitationUrl(appUrl, token, existingUser);
    const invitationMessage = this.teamInvitationMessage(
      context.organization.name,
      updated.member.role,
      existingUser,
      invitationUrl,
      employerApprovalRequired,
    );
    try {
      await this.emailDelivery.sendNotification(
        updated.member.email,
        `Invitation to join ${context.organization.name} on esllp`,
        invitationMessage,
        `team-invitation:${updated.member.id}:${tokenHash}`,
        "team_invitation",
        {
          organizationName: context.organization.name,
          invitationMessage,
        },
      );
    } catch (error) {
      await this.members.update(
        { id: memberId, invitationTokenHash: tokenHash },
        {
          invitationTokenHash: updated.previousTokenHash,
          invitationExpiresAt: updated.previousExpiresAt,
        },
      );
      throw error;
    }
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.team_invitation_resent",
      targetType: "employer_organization_member",
      targetId: updated.member.id,
      details: {
        organizationId: context.organization.id,
        email: updated.member.email,
      },
    });
    return {
      id: updated.member.id,
      email: updated.member.email,
      role: updated.member.role,
      status: "invited",
    };
  }

  private teamInvitationUrl(
    appUrl: string,
    token: string,
    existingUser: User | null,
  ) {
    const baseUrl = appUrl.replace(/\/+$/, "");
    return existingUser
      ? `${baseUrl}/#dashboard/team?invite=${encodeURIComponent(token)}`
      : `${baseUrl}/#employer-sign-up?invite=${encodeURIComponent(token)}`;
  }

  private teamInvitationMessage(
    organizationName: string,
    role: OrganizationMemberRole | InviteTeamMemberDto["role"],
    existingUser: User | null,
    invitationUrl: string,
    employerApprovalRequired: boolean,
  ) {
    const roleName = role.replace(/_/g, " ");
    const nextStep = existingUser
      ? existingUser.employerApprovalStatus ===
          EmployerApprovalStatus.APPROVED || !employerApprovalRequired
        ? "Sign in with this email address and accept the invitation."
        : "Sign in with this email address to view a read-only workspace preview. The invitation becomes available after an administrator approves your employer account."
      : employerApprovalRequired
        ? "Register as an employer using this link and the invited email address. Verify your email to view a read-only workspace preview while waiting for administrator approval."
        : "Register as an employer using this link and the invited email address, then verify your email to access the company workspace.";
    return `You have been invited to join ${organizationName} as a ${roleName}. ${nextStep} This invitation expires in 30 days: ${invitationUrl}`;
  }

  async acceptTeamInvite(user: AuthenticatedUser, token: string) {
    await this.assertEmployerAccess(user.id, false);
    const member = await this.members.findOne({
      where: {
        invitationTokenHash: this.hashToken(token),
        status: "invited",
        invitationExpiresAt: MoreThan(new Date()),
      },
      relations: { organization: true },
    });
    if (!member)
      throw new NotFoundException(
        "This team invitation is invalid or expired.",
      );
    if (member.email.toLowerCase() !== user.email.toLowerCase())
      throw new ForbiddenException(
        "Sign in with the email address this invitation was sent to.",
      );
    member.userId = user.id;
    member.status = "active";
    member.invitationTokenHash = null;
    member.invitationExpiresAt = null;
    await this.members.save(member);
    await this.addNotification(
      user.id,
      "team_invitation_accepted",
      "Company invitation accepted",
      `You joined ${member.organization.name}.`,
      "/#dashboard",
    );
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.team_invitation_accepted",
      targetType: "employer_organization_member",
      targetId: member.id,
      details: {
        organizationId: member.organizationId,
        role: member.role,
      },
    });
    return {
      organizationId: member.organizationId,
      organizationName: member.organization.name,
    };
  }

  async updateTeamMember(
    user: AuthenticatedUser,
    memberId: number,
    dto: UpdateTeamMemberDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, TEAM_MANAGERS);
    const member = await this.members.findOneBy({
      id: memberId,
      organizationId: context.organization.id,
    });
    if (!member) throw new NotFoundException("Team member was not found.");
    if (member.role === OrganizationMemberRole.OWNER)
      throw new BadRequestException(
        "The company owner role cannot be changed.",
      );
    if (member.userId === user.id)
      throw new BadRequestException(
        "You cannot remove or change your own team access.",
      );
    if (dto.role === "removed") {
      member.status = "removed";
      member.invitationTokenHash = null;
      member.invitationExpiresAt = null;
    } else {
      const roles: Record<
        Exclude<UpdateTeamMemberDto["role"], "removed">,
        OrganizationMemberRole
      > = {
        admin: OrganizationMemberRole.ADMIN,
        recruiter: OrganizationMemberRole.RECRUITER,
        hiring_manager: OrganizationMemberRole.HIRING_MANAGER,
        billing: OrganizationMemberRole.BILLING,
      };
      member.role = roles[dto.role];
    }
    await this.members.save(member);
    await this.auditService.record({
      actorUserId: user.id,
      action:
        dto.role === "removed"
          ? "employer.team_member_removed"
          : "employer.team_role_changed",
      targetType: "employer_organization_member",
      targetId: member.id,
      details: { organizationId: context.organization.id, role: dto.role },
    });
    return {
      id: member.id,
      email: member.email,
      role: member.role,
      status: member.status,
    };
  }

  async transferOrganizationOwnership(
    user: AuthenticatedUser,
    memberId: number,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    if (context.membership.role !== OrganizationMemberRole.OWNER) {
      throw new ForbiddenException(
        "Only the current company owner can transfer ownership.",
      );
    }
    const transferred = await this.dataSource.transaction(async (manager) => {
      const organizations = manager.getRepository(EmployerOrganization);
      const organization = await organizations.findOne({
        where: { id: context.organization.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!organization)
        throw new NotFoundException("Company workspace was not found.");
      const members = manager.getRepository(EmployerOrganizationMember);
      const currentOwner = await members.findOne({
        where: {
          id: context.membership.id,
          organizationId: organization.id,
          role: OrganizationMemberRole.OWNER,
          status: "active",
        },
        lock: { mode: "pessimistic_write" },
      });
      const nextOwner = await members.findOne({
        where: {
          id: memberId,
          organizationId: organization.id,
          status: "active",
        },
        lock: { mode: "pessimistic_write" },
      });
      if (
        !currentOwner ||
        !nextOwner ||
        nextOwner.role === OrganizationMemberRole.OWNER
      ) {
        throw new BadRequestException(
          "Choose an active, non-owner member of this company.",
        );
      }
      currentOwner.role = OrganizationMemberRole.ADMIN;
      nextOwner.role = OrganizationMemberRole.OWNER;
      await members.save(currentOwner);
      await members.save(nextOwner);
      return { currentOwner, nextOwner };
    });
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.organization_ownership_transferred",
      targetType: "employer_organization",
      targetId: context.organization.id,
      details: {
        previousOwnerMemberId: transferred.currentOwner.id,
        newOwnerMemberId: transferred.nextOwner.id,
      },
    });
    return {
      organizationId: context.organization.id,
      previousOwnerMemberId: transferred.currentOwner.id,
      newOwnerMemberId: transferred.nextOwner.id,
    };
  }

  async listNotifications(user: AuthenticatedUser, page = 1) {
    const safePage = Math.max(1, page);
    const limit = 25;
    const [items, total] = await this.notifications.findAndCount({
      where: { userId: user.id },
      order: { createdAt: "DESC" },
      skip: (safePage - 1) * limit,
      take: limit,
    });
    return { items, total, page: safePage, limit };
  }

  async markNotificationRead(user: AuthenticatedUser, notificationId: number) {
    const notification = await this.notifications.findOneBy({
      id: notificationId,
      userId: user.id,
    });
    if (!notification)
      throw new NotFoundException("Notification was not found.");
    notification.readAt ??= new Date();
    await this.notifications.save(notification);
    return { success: true };
  }

  async billingSummary(
    user: AuthenticatedUser,
    organizationId?: number,
    requestedPage = 1,
  ) {
    const { organization, membership } = await this.getContext(
      user.id,
      organizationId,
    );
    const plans = await this.planCatalog();
    const credentials = await this.razorpayConfiguration.credentials();
    const canManage = [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.BILLING,
    ].includes(membership.role);
    const page = Math.max(1, requestedPage);
    const limit = 20;
    const total = canManage
      ? Number(
          (
            (await this.dataSource.query(
              `SELECT COUNT(*)::text AS total
               FROM employer_subscription_payments
               WHERE organization_id = $1`,
              [organization.id],
            )) as Array<{ total: string }>
          )[0]?.total ?? 0,
        )
      : 0;
    const payments = canManage
      ? await this.dataSource.query(
          `SELECT id, plan_key AS "planKey",
                  ROUND(amount_paise::numeric / 100, 2)::text AS amount,
                  amount_paise::text AS "amountPaise", currency,
                  invoice_id AS "invoiceId", paid_at AS "paidAt"
           FROM employer_subscription_payments
           WHERE organization_id = $1
           ORDER BY paid_at DESC, id DESC
           LIMIT $2 OFFSET $3`,
          [organization.id, limit, (page - 1) * limit],
        )
      : [];
    return {
      currency: "INR",
      provider: "razorpay",
      plans,
      payments,
      current: {
        planKey: organization.planKey,
        status: organization.subscriptionStatus,
        currentPeriodEnd: organization.subscriptionCurrentPeriodEnd,
        pendingPlanKey: organization.pendingPlanKey,
        hasPaidSubscription: Boolean(organization.razorpaySubscriptionId),
        canManage,
      },
      billingProfile: {
        legalName: organization.billingLegalName,
        email: organization.billingEmail,
        taxId: organization.billingTaxId,
        address: organization.billingAddress,
      },
      paymentHistory: { page, limit, total },
      checkoutReady: Boolean(
        credentials.enabled && credentials.keyId && credentials.apiSecret,
      ),
    };
  }

  async updateBillingProfile(
    user: AuthenticatedUser,
    dto: UpdateEmployerBillingProfileDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.BILLING,
    ]);
    const changedFields = Object.keys(dto);
    const billingProfile = await this.dataSource.transaction(async (manager) => {
      const organizations = manager.getRepository(EmployerOrganization);
      const organization = await organizations.findOne({
        where: { id: context.organization.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!organization)
        throw new NotFoundException("Company workspace was not found.");
      if (dto.legalName !== undefined)
        organization.billingLegalName = dto.legalName?.trim() || null;
      if (dto.email !== undefined)
        organization.billingEmail = dto.email?.trim().toLowerCase() || null;
      if (dto.taxId !== undefined)
        organization.billingTaxId = dto.taxId?.trim().toUpperCase() || null;
      if (dto.address !== undefined)
        organization.billingAddress = dto.address?.trim() || null;
      await organizations.save(organization);
      await this.auditService.record(
        {
          actorUserId: user.id,
          action: "employer.billing_profile_updated",
          targetType: "employer_organization",
          targetId: organization.id,
          details: { changedFields: changedFields.join(",") },
        },
        manager,
      );
      return {
        legalName: organization.billingLegalName,
        email: organization.billingEmail,
        taxId: organization.billingTaxId,
        address: organization.billingAddress,
      };
    });
    return { billingProfile };
  }

  async subscriptionInvoiceUrl(
    user: AuthenticatedUser,
    paymentId: number,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.BILLING,
    ]);
    const payments = (await this.dataSource.query(
      `SELECT invoice_id AS "invoiceId"
       FROM employer_subscription_payments
       WHERE id = $1 AND organization_id = $2`,
      [paymentId, context.organization.id],
    )) as Array<{ invoiceId: string | null }>;
    const invoiceId = payments[0]?.invoiceId;
    if (!invoiceId)
      throw new NotFoundException(
        "An invoice is not available for this payment.",
      );
    const response = await this.razorpayRequest(
      `/invoices/${encodeURIComponent(invoiceId)}`,
      { method: "GET" },
    );
    const invoice = await this.readProviderResponse(response);
    if (invoice.id !== invoiceId || typeof invoice.short_url !== "string")
      throw new ServiceUnavailableException(
        "The payment provider did not return this invoice.",
      );
    let invoiceUrl: URL;
    try {
      invoiceUrl = new URL(invoice.short_url);
    } catch {
      throw new ServiceUnavailableException(
        "The payment provider returned an invalid invoice URL.",
      );
    }
    if (
      invoiceUrl.protocol !== "https:" ||
      !(
        invoiceUrl.hostname === "rzp.io" ||
        invoiceUrl.hostname === "razorpay.com" ||
        invoiceUrl.hostname.endsWith(".razorpay.com")
      )
    )
      throw new ServiceUnavailableException(
        "The payment provider returned an untrusted invoice URL.",
      );
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.subscription_invoice_accessed",
      targetType: "employer_subscription_payment",
      targetId: paymentId,
      details: { organizationId: context.organization.id },
    });
    return { invoiceUrl: invoiceUrl.toString() };
  }

  async createSubscription(
    user: AuthenticatedUser,
    planKey: PaidPlanKey,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.BILLING,
    ]);
    const credentials = await this.razorpayConfiguration.credentials();
    if (!credentials.enabled)
      throw new ServiceUnavailableException(
        "Razorpay checkout is disabled in the admin dashboard.",
      );
    const plans = await this.planCatalog();
    const plan = plans.find((item) => item.key === planKey);
    if (!plan?.razorpayPlanId)
      throw new ServiceUnavailableException(
        `Configure the Razorpay ${planKey} plan in the admin dashboard before enabling this plan.`,
      );
    if (plan.amountInr === null || plan.amountInr <= 0)
      throw new ServiceUnavailableException(
        `Set a positive ${planKey} price in the admin dashboard matching the Razorpay plan before enabling checkout.`,
      );
    const planResponse = await this.razorpayRequest(
      `/plans/${encodeURIComponent(plan.razorpayPlanId)}`,
      { method: "GET" },
    );
    const providerPlan = await this.readProviderResponse(planResponse);
    if (
      providerPlan.currency !== "INR" ||
      providerPlan.period !== "monthly" ||
      providerPlan.interval !== 1 ||
      typeof providerPlan.amount !== "number" ||
      providerPlan.amount !== Math.round(plan.amountInr * 100)
    )
      throw new ServiceUnavailableException(
        `The configured Razorpay ${planKey} plan must be monthly in INR and match the price in the admin dashboard.`,
      );
    const reservation = await this.dataSource.transaction(async (manager) => {
      const organizations = manager.getRepository(EmployerOrganization);
      const organization = await organizations.findOne({
        where: { id: context.organization.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!organization)
        throw new NotFoundException("Company workspace was not found.");

      if (organization.pendingRazorpaySubscriptionId) {
        const pendingId = organization.pendingRazorpaySubscriptionId;
        if (pendingId.startsWith("creating:")) {
          const createdAt = Number(pendingId.split(":")[1]);
          if (
            !Number.isSafeInteger(createdAt) ||
            Date.now() - createdAt < 120_000
          )
            throw new ConflictException(
              "A subscription checkout is already being created. Please retry shortly.",
            );
          organization.pendingPlanKey = null;
          organization.pendingRazorpaySubscriptionId = null;
        } else {
          if (organization.pendingPlanKey !== planKey) {
            throw new ConflictException(
              "A checkout for another plan is already awaiting payment.",
            );
          }
          return {
            existingSubscriptionId: pendingId,
            reservationKey: null,
            organizationName: organization.name,
          };
        }
      }
      if (
        organization.planKey === planKey &&
        ["active", "cancel_pending"].includes(organization.subscriptionStatus)
      ) {
        throw new ConflictException(
          "A subscription for this plan is already active or awaiting payment.",
        );
      }
      if (organization.razorpaySubscriptionId) {
        throw new ConflictException(
          "A paid subscription is already attached to this company. Cancel it and wait for its cancellation confirmation before starting another plan to avoid overlapping charges.",
        );
      }
      const reservationKey = `creating:${Date.now()}:${randomBytes(8).toString("hex")}`;
      organization.pendingPlanKey = planKey;
      organization.pendingRazorpaySubscriptionId = reservationKey;
      await organizations.save(organization);
      return {
        existingSubscriptionId: null,
        reservationKey,
        organizationName: organization.name,
      };
    });

    if (reservation.existingSubscriptionId) {
      const pendingResponse = await this.razorpayRequest(
        `/subscriptions/${encodeURIComponent(reservation.existingSubscriptionId)}`,
        { method: "GET" },
      );
      if (pendingResponse.status === 404) {
        await this.dataSource.query(
          `UPDATE employer_organizations
           SET pending_plan_key = NULL, pending_razorpay_subscription_id = NULL,
               updated_at = now()
           WHERE id = $1 AND pending_razorpay_subscription_id = $2`,
          [context.organization.id, reservation.existingSubscriptionId],
        );
        throw new ConflictException(
          "The pending Razorpay checkout expired. Please start checkout again.",
        );
      }
      const pendingSubscription =
        await this.readProviderResponse(pendingResponse);
      if (
        pendingSubscription.id !== reservation.existingSubscriptionId ||
        !["created", "authenticated", "active"].includes(
          String(pendingSubscription.status),
        )
      )
        throw new ServiceUnavailableException(
          "The pending Razorpay subscription could not be verified.",
        );
      const checkout = {
        keyId: credentials.keyId,
        subscriptionId: reservation.existingSubscriptionId,
        planKey,
        companyName: reservation.organizationName,
        email: user.email,
        amountInr: plan.amountInr,
      };
      await this.auditService.record({
        actorUserId: user.id,
        action: "employer.subscription_checkout_started",
        targetType: "employer_organization",
        targetId: context.organization.id,
        details: { planKey, amountInr: plan.amountInr, reused: true },
      });
      return checkout;
    }

    let subscriptionId: string;
    try {
      const response = await this.razorpayRequest("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          plan_id: plan.razorpayPlanId,
          total_count: 120,
          customer_notify: 1,
          notes: {
            organizationId: String(context.organization.id),
            planKey,
            requestedByUserId: String(user.id),
          },
        }),
      });
      const payload = await this.readProviderResponse(response);
      if (typeof payload.id !== "string")
        throw new ServiceUnavailableException(
          "Razorpay returned an invalid subscription response.",
        );
      subscriptionId = payload.id;
      await this.dataSource.transaction(async (manager) => {
        const organizations = manager.getRepository(EmployerOrganization);
        const organization = await organizations.findOne({
          where: { id: context.organization.id },
          lock: { mode: "pessimistic_write" },
        });
        if (
          !organization ||
          organization.pendingRazorpaySubscriptionId !==
            reservation.reservationKey
        )
          throw new ConflictException(
            "The subscription reservation changed before checkout could be saved.",
          );
        organization.pendingRazorpaySubscriptionId = subscriptionId;
        await organizations.save(organization);
      });
    } catch (error) {
      await this.dataSource.query(
        `UPDATE employer_organizations
         SET pending_plan_key = NULL, pending_razorpay_subscription_id = NULL,
             updated_at = now()
         WHERE id = $1 AND pending_razorpay_subscription_id = $2`,
        [context.organization.id, reservation.reservationKey],
      );
      throw error;
    }

    const checkout = {
      keyId: credentials.keyId,
      subscriptionId,
      planKey,
      companyName: reservation.organizationName,
      email: user.email,
      amountInr: plan.amountInr,
    };
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.subscription_checkout_started",
      targetType: "employer_organization",
      targetId: context.organization.id,
      details: { planKey, amountInr: plan.amountInr },
    });
    return checkout;
  }

  async verifySubscription(
    user: AuthenticatedUser,
    payload: {
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
    },
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.BILLING,
    ]);
    const { apiSecret: secret } =
      await this.razorpayConfiguration.credentials();
    if (!secret)
      throw new ServiceUnavailableException(
        "Razorpay key secret is not configured.",
      );
    const expected = createHmac("sha256", secret)
      .update(
        `${payload.razorpay_payment_id}|${payload.razorpay_subscription_id}`,
      )
      .digest();
    const supplied = Buffer.from(payload.razorpay_signature, "hex");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new UnauthorizedException(
        "Razorpay checkout signature verification failed.",
      );

    const response = await this.razorpayRequest(
      `/subscriptions/${encodeURIComponent(payload.razorpay_subscription_id)}`,
      { method: "GET" },
    );
    const subscription = await this.readProviderResponse(response);
    const subscriptionNotes = asJsonObject(subscription.notes);
    if (subscription.id !== payload.razorpay_subscription_id)
      throw new ForbiddenException(
        "Razorpay subscription ownership could not be confirmed.",
      );
    const result = await this.dataSource.transaction(async (manager) => {
      const organizations = manager.getRepository(EmployerOrganization);
      const organization = await organizations.findOne({
        where: { id: context.organization.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!organization)
        throw new NotFoundException("Company workspace was not found.");
      const isPending =
        organization.pendingRazorpaySubscriptionId === subscription.id;
      const isAlreadyApplied =
        organization.razorpaySubscriptionId === subscription.id;
      if (
        subscriptionNotes?.organizationId !== String(organization.id) ||
        (!isPending && !isAlreadyApplied)
      )
        throw new ForbiddenException(
          "The subscription does not belong to this company.",
        );
      const planKey = isPending
        ? organization.pendingPlanKey
        : organization.planKey;
      if (subscriptionNotes.planKey !== planKey || !isPaidPlanKey(planKey))
        throw new ForbiddenException(
          "The Razorpay subscription plan does not match this company.",
        );
      const planSnapshot = await this.subscriptionPlanSnapshot(planKey);
      if (!planSnapshot || subscription.plan_id !== planSnapshot.razorpayPlanId)
        throw new ForbiddenException(
          "The Razorpay subscription plan does not match the configured plan.",
        );
      if (subscription.status === "active") {
        organization.planKey = planKey;
        organization.subscriptionStatus = "active";
        organization.razorpaySubscriptionId = payload.razorpay_subscription_id;
        organization.subscriptionPlanSnapshot = planSnapshot;
        organization.pastDueStartedAt = null;
        organization.pendingPlanKey = null;
        organization.pendingRazorpaySubscriptionId = null;
        organization.subscriptionCurrentPeriodEnd = this.epochDate(
          subscription.current_end,
        );
        await organizations.save(organization);
        await this.enforceJobQuota(
          organization,
          manager.getRepository(Job),
          manager,
        );
      }
      return {
        status: subscription.status,
        active: subscription.status === "active",
        message: "Payment confirmation received.",
      };
    });
    if (result.active) {
      await this.auditService.record({
        actorUserId: user.id,
        action: "employer.subscription_activated",
        targetType: "employer_organization",
        targetId: context.organization.id,
        details: { active: result.active },
      });
    }
    return result;
  }

  async cancelSubscription(user: AuthenticatedUser, organizationId?: number) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.BILLING,
    ]);
    if (context.organization.subscriptionStatus === "cancel_pending")
      return { status: context.organization.subscriptionStatus };
    const subscriptionId = context.organization.razorpaySubscriptionId;
    if (!subscriptionId)
      throw new BadRequestException(
        "There is no active paid subscription to cancel.",
      );
    const response = await this.razorpayRequest(
      `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ cancel_at_cycle_end: 1 }),
      },
    );
    await this.readProviderResponse(response);
    context.organization.subscriptionStatus = "cancel_pending";
    await this.organizations.save(context.organization);
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.subscription_cancellation_requested",
      targetType: "employer_organization",
      targetId: context.organization.id,
      details: { planKey: context.organization.planKey },
    });
    return { status: context.organization.subscriptionStatus };
  }

  async reconcileSubscriptions() {
    const organizations = await this.organizations
      .createQueryBuilder("organization")
      .where(
        "organization.razorpaySubscriptionId IS NOT NULL OR organization.pendingRazorpaySubscriptionId IS NOT NULL",
      )
      .orderBy("organization.updatedAt", "ASC")
      .take(100)
      .getMany();
    const discrepancies: Array<{
      organizationId: number;
      storedStatus: string;
      providerStatus: string;
      changed: boolean;
    }> = [];
    let failures = 0;
    for (const organization of organizations) {
      const subscriptionId =
        organization.razorpaySubscriptionId ??
        organization.pendingRazorpaySubscriptionId;
      if (!subscriptionId || subscriptionId.startsWith("creating:")) continue;
      try {
        const response = await this.razorpayRequest(
          `/subscriptions/${encodeURIComponent(subscriptionId)}`,
          { method: "GET" },
        );
        const provider = await this.readProviderResponse(response);
        const pending =
          organization.pendingRazorpaySubscriptionId === subscriptionId;
        const planKey = pending
          ? organization.pendingPlanKey
          : organization.planKey;
        const snapshot = isPaidPlanKey(planKey)
          ? await this.subscriptionPlanSnapshot(planKey)
          : null;
        if (
          provider.id !== subscriptionId ||
          (snapshot && provider.plan_id !== snapshot.razorpayPlanId)
        )
          throw new ServiceUnavailableException(
            "The provider subscription does not match the stored plan configuration.",
          );
        const providerStatus =
          typeof provider.status === "string" ? provider.status : "unknown";
        const changed = await this.dataSource.transaction(async (manager) => {
          const repository = manager.getRepository(EmployerOrganization);
          const current = await repository.findOne({
            where: { id: organization.id },
            lock: { mode: "pessimistic_write" },
          });
          if (
            !current ||
            (current.razorpaySubscriptionId !== subscriptionId &&
              current.pendingRazorpaySubscriptionId !== subscriptionId)
          )
            return false;
          const before = JSON.stringify({
            planKey: current.planKey,
            status: current.subscriptionStatus,
            periodEnd: current.subscriptionCurrentPeriodEnd,
            pastDueStartedAt: current.pastDueStartedAt,
            pendingPlanKey: current.pendingPlanKey,
            pendingSubscriptionId: current.pendingRazorpaySubscriptionId,
            snapshot: current.subscriptionPlanSnapshot,
          });
          if (providerStatus === "active" && planKey && snapshot) {
            current.planKey = planKey;
            current.razorpaySubscriptionId = subscriptionId;
            current.pendingPlanKey = null;
            current.pendingRazorpaySubscriptionId = null;
            current.subscriptionPlanSnapshot = snapshot;
            current.subscriptionStatus = "active";
            current.pastDueStartedAt = null;
            current.subscriptionCurrentPeriodEnd =
              this.epochDate(provider.current_end) ??
              current.subscriptionCurrentPeriodEnd;
          } else if (providerStatus === "halted") {
            current.subscriptionStatus = "past_due";
            current.pastDueStartedAt ??= new Date();
          } else if (
            providerStatus === "cancelled" ||
            providerStatus === "completed"
          ) {
            current.planKey = "free";
            current.subscriptionStatus = "free";
            current.razorpaySubscriptionId = null;
            current.pendingRazorpaySubscriptionId = null;
            current.pendingPlanKey = null;
            current.subscriptionPlanSnapshot = null;
            current.subscriptionCurrentPeriodEnd = null;
            current.pastDueStartedAt = null;
          }
          const after = JSON.stringify({
            planKey: current.planKey,
            status: current.subscriptionStatus,
            periodEnd: current.subscriptionCurrentPeriodEnd,
            pastDueStartedAt: current.pastDueStartedAt,
            pendingPlanKey: current.pendingPlanKey,
            pendingSubscriptionId: current.pendingRazorpaySubscriptionId,
            snapshot: current.subscriptionPlanSnapshot,
          });
          if (before !== after) await repository.save(current);
          await this.enforceJobQuota(
            current,
            manager.getRepository(Job),
            manager,
          );
          return before !== after;
        });
        if (
          changed ||
          (organization.subscriptionStatus !== providerStatus &&
            ["active", "halted", "cancelled", "completed"].includes(
              providerStatus,
            ))
        )
          discrepancies.push({
            organizationId: organization.id,
            storedStatus: organization.subscriptionStatus,
            providerStatus,
            changed,
          });
      } catch (error) {
        failures += 1;
        this.logger.error(
          `Subscription reconciliation failed for organization ${organization.id}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }
    return {
      checked: organizations.length,
      failures,
      discrepancies,
      reconciledAt: new Date().toISOString(),
    };
  }

  async handleRazorpayWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    eventId: string | undefined,
    body: Record<string, unknown>,
  ) {
    const { webhookSecret: secret } =
      await this.razorpayConfiguration.credentials();
    if (!secret)
      throw new ServiceUnavailableException(
        "Razorpay webhook secret is not configured.",
      );
    if (
      !rawBody ||
      !signature ||
      !/^[a-f\d]{64}$/i.test(signature) ||
      !eventId?.trim() ||
      eventId.trim().length > 100
    )
      throw new UnauthorizedException(
        "Razorpay webhook signature headers are required.",
      );
    const expected = createHmac("sha256", secret).update(rawBody).digest();
    const supplied = Buffer.from(signature, "hex");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new UnauthorizedException("Razorpay webhook signature is invalid.");
    const normalizedEventId = eventId.trim();
    const eventPayload = asJsonObject(body.payload);
    const incomingSubscriptionEnvelope = asJsonObject(
      eventPayload?.subscription,
    );
    const incomingSubscription = asJsonObject(
      incomingSubscriptionEnvelope?.entity,
    );
    let providerSubscription: JsonObject | null = null;
    if (
      typeof body.event === "string" &&
      body.event.startsWith("subscription.")
    ) {
      if (!incomingSubscription || typeof incomingSubscription.id !== "string")
        throw new BadRequestException(
          "The Razorpay subscription event is malformed.",
        );
      const response = await this.razorpayRequest(
        `/subscriptions/${encodeURIComponent(incomingSubscription.id)}`,
        { method: "GET" },
      );
      providerSubscription = await this.readProviderResponse(response);
      if (providerSubscription.id !== incomingSubscription.id)
        throw new ServiceUnavailableException(
          "Razorpay returned a different subscription during reconciliation.",
        );
    }
    return this.dataSource.transaction(async (manager) => {
      const inserted = (await manager.query(
        `INSERT INTO razorpay_webhook_events (event_id)
         VALUES ($1)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [normalizedEventId],
      )) as Array<{ event_id: string }>;
      if (inserted.length === 0) return { received: true, duplicate: true };

      if (body.event === "refund.processed")
        return this.processEmployerRefund(manager, eventPayload);
      const subscription = providerSubscription;
      if (!subscription || typeof subscription.id !== "string")
        return { received: true, ignored: true };

      const subscriptionId = subscription.id;
      const organizations = manager.getRepository(EmployerOrganization);
      const organization = await organizations.findOne({
        where: [
          { pendingRazorpaySubscriptionId: subscriptionId },
          { razorpaySubscriptionId: subscriptionId },
        ],
      });
      if (!organization) {
        if (body.event === "subscription.charged") {
          this.logger.error(
            `Received subscription charge for an unlinked subscription (${subscriptionId}).`,
          );
          throw new ServiceUnavailableException(
            "The employer subscription charge could not be linked to an organization.",
          );
        }
        return { received: true, ignored: true };
      }

      const pending =
        organization.pendingRazorpaySubscriptionId === subscriptionId;
      const planKey = pending
        ? organization.pendingPlanKey
        : organization.planKey;
      const planSnapshot = isPaidPlanKey(planKey)
        ? await this.subscriptionPlanSnapshot(planKey)
        : null;
      if (planSnapshot && subscription.plan_id !== planSnapshot.razorpayPlanId)
        throw new BadRequestException(
          "The Razorpay subscription does not match the configured plan.",
        );
      if (body.event === "subscription.charged") {
        const paymentPayload = asJsonObject(eventPayload?.payment);
        const payment = asJsonObject(paymentPayload?.entity);
        const createdAt = payment?.created_at;
        const paidAt =
          typeof createdAt === "number" &&
          Number.isSafeInteger(createdAt) &&
          createdAt > 0 &&
          createdAt <= 8_640_000_000_000
            ? new Date(createdAt * 1000)
            : null;
        if (
          !payment ||
          typeof payment.id !== "string" ||
          !payment.id.trim() ||
          payment.id.length > 100 ||
          payment.status !== "captured" ||
          typeof payment.amount !== "number" ||
          !Number.isSafeInteger(payment.amount) ||
          payment.amount < 1 ||
          typeof payment.currency !== "string" ||
          !/^[A-Z]{3}$/i.test(payment.currency) ||
          !paidAt ||
          Number.isNaN(paidAt.getTime())
        )
          throw new BadRequestException(
            "The Razorpay subscription charge is missing valid captured payment details.",
          );
        if (
          !planSnapshot ||
          subscription.plan_id !== planSnapshot.razorpayPlanId ||
          payment.amount !== Math.round(planSnapshot.amountInr * 100) ||
          String(payment.currency).toUpperCase() !== planSnapshot.currency
        )
          throw new BadRequestException(
            "The Razorpay subscription charge does not match the configured plan amount and currency.",
          );
        const invoiceId =
          typeof payment.invoice_id === "string" &&
          payment.invoice_id.length <= 100
            ? payment.invoice_id
            : null;
        await manager.query(
          `INSERT INTO employer_subscription_payments (
             organization_id, subscription_id, razorpay_payment_id,
             invoice_id, plan_key, amount_paise, currency, paid_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (razorpay_payment_id) DO NOTHING`,
          [
            organization.id,
            subscriptionId,
            payment.id,
            invoiceId,
            planKey,
            String(payment.amount),
            payment.currency.toUpperCase(),
            paidAt,
          ],
        );
      }
      let reconcileJobs = false;
      switch (subscription.status) {
        case "active":
          if (pending && planKey) {
            organization.planKey = planKey;
            organization.razorpaySubscriptionId = subscriptionId;
            organization.pendingPlanKey = null;
            organization.pendingRazorpaySubscriptionId = null;
            organization.subscriptionPlanSnapshot = planSnapshot;
          }
          if (!organization.subscriptionPlanSnapshot && planKey)
            organization.subscriptionPlanSnapshot = planSnapshot;
          organization.subscriptionStatus = "active";
          organization.pastDueStartedAt = null;
          organization.subscriptionCurrentPeriodEnd =
            this.epochDate(subscription.current_end) ??
            organization.subscriptionCurrentPeriodEnd;
          await organizations.save(organization);
          reconcileJobs = true;
          break;
        case "halted":
          organization.subscriptionStatus = "past_due";
          organization.pastDueStartedAt ??= new Date();
          await organizations.save(organization);
          reconcileJobs = true;
          break;
        case "cancelled":
        case "completed":
          if (pending) {
            organization.pendingPlanKey = null;
            organization.pendingRazorpaySubscriptionId = null;
          } else {
            organization.planKey = "free";
            organization.subscriptionStatus = "free";
            organization.razorpaySubscriptionId = null;
            organization.subscriptionCurrentPeriodEnd = null;
            organization.subscriptionPlanSnapshot = null;
            organization.pastDueStartedAt = null;
          }
          await organizations.save(organization);
          reconcileJobs = !pending;
          break;
        default:
          break;
      }
      if (reconcileJobs)
        await this.enforceJobQuota(
          organization,
          manager.getRepository(Job),
          manager,
        );
      return { received: true };
    });
  }

  private async processEmployerRefund(
    manager: EntityManager,
    payload: JsonObject | null,
  ) {
    const refundEnvelope = asJsonObject(payload?.refund);
    const refund = asJsonObject(refundEnvelope?.entity);
    if (
      !refund ||
      typeof refund.id !== "string" ||
      typeof refund.payment_id !== "string" ||
      refund.status !== "processed" ||
      typeof refund.amount !== "number" ||
      !Number.isSafeInteger(refund.amount) ||
      refund.amount < 1
    )
      throw new BadRequestException("The Razorpay refund event is malformed.");
    const payments = (await manager.query(
      `SELECT amount_paise AS "amountPaise"
       FROM employer_subscription_payments
       WHERE razorpay_payment_id = $1
       FOR UPDATE`,
      [refund.payment_id],
    )) as Array<{ amountPaise: number | string }>;
    const payment = payments[0];
    if (!payment) return { received: true, ignored: true };
    const inserted = (await manager.query(
      `INSERT INTO payment_refunds (
         payment_source, payment_reference, amount_paise, reason,
         status, provider_refund_id, processed_at
       )
       VALUES ('employer', $1, $2, 'Razorpay refund', 'processed', $3, now())
       ON CONFLICT (provider_refund_id) DO NOTHING
       RETURNING id`,
      [refund.payment_id, refund.amount, refund.id],
    )) as Array<{ id: number }>;
    if (!inserted.length) return { received: true, duplicate: true };
    const totals = (await manager.query(
      `SELECT COALESCE(SUM(amount_paise), 0)::bigint AS refunded
       FROM payment_refunds
       WHERE payment_source = 'employer'
         AND payment_reference = $1
         AND status = 'processed'`,
      [refund.payment_id],
    )) as Array<{ refunded: number | string }>;
    const refunded = Number(totals[0]?.refunded ?? 0);
    const capturedAmount = Number(payment.amountPaise);
    if (refunded > capturedAmount)
      throw new BadRequestException(
        "The Razorpay refunds exceed the captured employer payment.",
      );
    const fullyRefunded = refunded === capturedAmount;
    return { received: true, refundedPaise: refunded, fullyRefunded };
  }

  private async getContext(
    userId: number,
    organizationId?: number,
    allowPending = false,
  ): Promise<EmployerContext> {
    await this.assertEmployerAccess(userId, allowPending);
    const where = {
      userId,
      status: "active" as const,
      ...(organizationId === undefined ? {} : { organizationId }),
    };
    const membership = await this.members.findOne({
      where,
      relations: { organization: true },
      order: { createdAt: "ASC" },
    });
    if (!membership) {
      if (organizationId !== undefined)
        throw new ForbiddenException(
          "You do not have active access to this company.",
        );
      throw new NotFoundException(
        "No active employer company is linked to this account.",
      );
    }
    return { organization: membership.organization, membership };
  }

  private async assertEmployerAccess(userId: number, allowPending: boolean) {
    const user = await this.users.findOneBy({
      id: userId,
      role: UserRole.EMPLOYER,
      isActive: true,
    });
    if (
      !user ||
      user.employerApprovalStatus === EmployerApprovalStatus.REJECTED
    )
      throw new ForbiddenException(
        "An active employer account with the required approval is required.",
      );
    if (user.employerApprovalStatus === EmployerApprovalStatus.APPROVED) return;
    if (user.employerApprovalStatus !== EmployerApprovalStatus.PENDING) {
      throw new ForbiddenException(
        "An active employer account with the required approval is required.",
      );
    }
    if (
      !allowPending &&
      (await this.platformConfiguration.get()).employerApprovalRequired
    )
      throw new ForbiddenException(
        "An active employer account with the required approval is required.",
      );
  }

  private requireRole(
    membership: EmployerOrganizationMember,
    roles: OrganizationMemberRole[],
  ) {
    if (!roles.includes(membership.role))
      throw new ForbiddenException(
        "Your company role does not allow this action.",
      );
  }

  private async limitsFor(organization: EmployerOrganization) {
    return employerPlanLimits(organization, this.razorpayConfiguration);
  }

  private async subscriptionPlanSnapshot(planKey: string | null) {
    if (!isPaidPlanKey(planKey)) return null;
    const plan = (await this.razorpayConfiguration.employerPlans())[planKey];
    if (!plan?.planId || !plan.amountInr || plan.amountInr <= 0)
      throw new ServiceUnavailableException(
        `The ${planKey} plan is not fully configured for subscription activation.`,
      );
    return {
      activeJobs: plan.activeJobs,
      seats: plan.seats,
      resumeCredits: plan.resumeCredits,
      amountInr: plan.amountInr,
      currency: "INR",
      razorpayPlanId: plan.planId,
    };
  }

  private currentResumeCreditPeriod() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    if (!year || !month)
      throw new ServiceUnavailableException(
        "The current resume-credit period could not be determined.",
      );
    return `${year}-${month}`;
  }

  private async assertJobQuota(
    organization: EmployerOrganization,
    jobs: Repository<Job> = this.jobs,
  ) {
    const limits = await this.limitsFor(organization);
    const activeJobs = await jobs.countBy({
      organizationId: organization.id,
      isActive: true,
    });
    if (activeJobs >= limits.activeJobs)
      throw new ForbiddenException(
        `Your ${organization.planKey} plan allows ${limits.activeJobs} active job(s). Close a job or upgrade your plan to publish another.`,
      );
  }

  private async enforceJobQuota(
    organization: EmployerOrganization,
    jobs: Repository<Job> = this.jobs,
    manager?: EntityManager,
  ) {
    const limit = (await this.limitsFor(organization)).activeJobs;
    const activeJobs = await jobs.find({
      where: { organizationId: organization.id, isActive: true },
      order: { createdAt: "DESC", id: "DESC" },
    });
    const excessJobs = activeJobs.slice(limit);
    if (excessJobs.length) {
      for (const job of excessJobs) job.isActive = false;
      await jobs.save(excessJobs);
      for (const job of excessJobs) {
        await this.jobsService.syncSearchIndex(job, manager);
      }
    }
  }

  private async findOrganizationJob(jobId: number, organizationId: number) {
    const job = await this.jobs.findOneBy({ id: jobId, organizationId });
    if (!job) throw new NotFoundException("Job was not found in this company.");
    return job;
  }

  private normalizeApplicationQuestions(
    questions: Array<{ id: string; question: string; required: boolean }>,
  ) {
    const ids = new Set<string>();
    return questions.map((question) => {
      const id = question.id.trim();
      const prompt = question.question.trim();
      if (!id || !prompt || ids.has(id))
        throw new BadRequestException(
          "Application question IDs must be unique and prompts cannot be empty.",
        );
      ids.add(id);
      return { id, question: prompt, required: question.required };
    });
  }

  private normalizeRequiredDocuments(
    documents: Array<{ id: string; label: string; required: boolean }>,
  ) {
    const ids = new Set<string>();
    return documents.map((document) => {
      const id = document.id.trim();
      const label = document.label.trim();
      if (!id || !label || ids.has(id))
        throw new BadRequestException(
          "Required document IDs must be unique and labels cannot be empty.",
        );
      ids.add(id);
      return { id, label, required: document.required };
    });
  }

  private validateSalary(min?: number | null, max?: number | null) {
    if (min != null && max != null && min > max)
      throw new BadRequestException(
        "Minimum salary cannot exceed maximum salary.",
      );
  }

  private async assertApplicationBelongsToOrganization(
    applicationId: number,
    organizationId: number,
  ) {
    const exists = await this.applications
      .createQueryBuilder("application")
      .innerJoin("application.job", "job")
      .where("application.id = :applicationId", { applicationId })
      .andWhere("job.organizationId = :organizationId", { organizationId })
      .getExists();
    if (!exists) throw new NotFoundException("Application was not found.");
  }

  private async getApplicationWithCandidate(
    applicationId: number,
    organizationId: number,
  ) {
    const application = await this.applications
      .createQueryBuilder("application")
      .innerJoinAndSelect("application.job", "job")
      .innerJoinAndSelect("application.user", "candidate")
      .where("application.id = :applicationId", { applicationId })
      .andWhere("job.organizationId = :organizationId", { organizationId })
      .getOne();
    if (!application) throw new NotFoundException("Application was not found.");
    return application;
  }

  private async addNotification(
    userId: number,
    type: string,
    title: string,
    message: string,
    link: string | null,
  ) {
    await this.notifications.save(
      this.notifications.create({
        userId,
        type,
        title,
        message,
        link,
        readAt: null,
      }),
    );
  }

  private async planCatalog() {
    const configured = await this.razorpayConfiguration.employerPlans();
    const plan = (
      key: "free" | PaidPlanKey,
      name: string,
      activeJobs: number,
      seats: number,
      resumeCredits: number,
      providerPlanId?: string | null,
      amountInr?: number | null,
    ) => ({
      key,
      name,
      currency: "INR",
      amountInr: amountInr ?? (key === "free" ? 0 : null),
      activeJobs,
      seats,
      resumeCredits,
      razorpayPlanId: providerPlanId || null,
    });
    return [
      plan("free", "Free", 1, 1, 0),
      plan(
        "starter",
        "Starter",
        configured.starter.activeJobs,
        configured.starter.seats,
        configured.starter.resumeCredits,
        configured.starter.planId,
        configured.starter.amountInr,
      ),
      plan(
        "growth",
        "Growth",
        configured.growth.activeJobs,
        configured.growth.seats,
        configured.growth.resumeCredits,
        configured.growth.planId,
        configured.growth.amountInr,
      ),
      plan(
        "business",
        "Business",
        configured.business.activeJobs,
        configured.business.seats,
        configured.business.resumeCredits,
        configured.business.planId,
        configured.business.amountInr,
      ),
      plan(
        "enterprise",
        "Enterprise",
        configured.enterprise.activeJobs,
        configured.enterprise.seats,
        configured.enterprise.resumeCredits,
        configured.enterprise.planId,
        configured.enterprise.amountInr,
      ),
    ];
  }

  private async razorpayRequest(
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const { keyId, apiSecret } = await this.razorpayConfiguration.credentials();
    if (!keyId || !apiSecret)
      throw new ServiceUnavailableException(
        "Razorpay key ID and API secret must be configured.",
      );
    return fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${apiSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
  }

  private async readProviderResponse(response: Response): Promise<JsonObject> {
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const errorObject = asJsonObject(asJsonObject(payload)?.error);
      const description =
        typeof errorObject?.description === "string"
          ? errorObject.description
          : undefined;
      this.logger.error(
        `Razorpay API request failed (HTTP ${response.status}).`,
      );
      throw new ServiceUnavailableException(
        description || `Razorpay request failed (HTTP ${response.status}).`,
      );
    }
    const object = asJsonObject(payload);
    if (!object)
      throw new ServiceUnavailableException(
        "Razorpay returned an invalid response.",
      );
    return object;
  }

  private epochDate(value: unknown): Date | null {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
    const date = new Date(value * 1000);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private slugify(value: string) {
    return (
      value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 150) || "company"
    );
  }
}
