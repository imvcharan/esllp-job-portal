import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
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
import { DataSource, IsNull, MoreThan, Repository } from "typeorm";
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
import { CandidateApplicationsService } from "../users/candidate-applications.service";
import {
  CreateEmployerJobDto,
  UpdateEmployerJobDto,
} from "./dto/employer-job.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import {
  CreateEmployerInterviewDto,
  CreateEmployerOfferDto,
  CreateEmployerNoteDto,
  EmployerApplicantsQueryDto,
  InviteTeamMemberDto,
  UpdateTeamMemberDto,
} from "./dto/employer-workflow.dto";
import { ResolveCandidateWithdrawalDto } from "../users/dto/resolve-candidate-withdrawal.dto";
import { EmployerApplicationNote } from "./employer-application-note.entity";
import { EmployerApplicationTag } from "./employer-application-tag.entity";
import { EmployerInterview } from "./employer-interview.entity";
import {
  EmployerOrganizationMember,
  OrganizationMemberRole,
} from "./organization-member.entity";
import { EmployerOrganization } from "./organization.entity";
import { UserNotification } from "./user-notification.entity";
import { JobsService } from "../jobs/jobs.service";
import {
  currentJobDeadlineDate,
  jobPublicationError,
} from "../jobs/job.constants";

const PLAN_LIMITS = {
  free: { activeJobs: 1, seats: 1 },
  starter: { activeJobs: 3, seats: 3 },
  growth: { activeJobs: 10, seats: 10 },
} as const;

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
export class EmployersService {
  private readonly logger = new Logger(EmployersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EmployerOrganization)
    private readonly organizations: Repository<EmployerOrganization>,
    @InjectRepository(EmployerOrganizationMember)
    private readonly members: Repository<EmployerOrganizationMember>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
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
    @InjectRepository(UserNotification)
    private readonly notifications: Repository<UserNotification>,
    private readonly applicationsService: CandidateApplicationsService,
    private readonly fileStorage: CandidateFileStorageService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly auditService: AuditService,
    private readonly jobsService: JobsService,
  ) {}

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
      industry: organization.industry,
      companySize: organization.companySize,
      description: organization.description,
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
    if (dto.name !== undefined) {
      context.organization.name = dto.name.trim();
      context.organization.slug = `${this.slugify(dto.name)}-${context.organization.id}`;
    }
    if (dto.website !== undefined)
      context.organization.website = dto.website?.trim() || null;
    if (dto.industry !== undefined)
      context.organization.industry = dto.industry?.trim() || null;
    if (dto.companySize !== undefined)
      context.organization.companySize = dto.companySize || null;
    if (dto.description !== undefined)
      context.organization.description = dto.description?.trim() || null;
    const saved = await this.organizations.save(context.organization);
    if (dto.name !== undefined) {
      await this.jobs.update(
        { organizationId: saved.id },
        { company: saved.name },
      );
    }
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.company_updated",
      targetType: "employer_organization",
      targetId: saved.id,
      details: { fieldCount: Object.keys(dto).length },
    });
    return saved;
  }

  async getDashboard(user: AuthenticatedUser, organizationId?: number) {
    const { organization, membership } = await this.getContext(
      user.id,
      organizationId,
      true,
    );
    const jobs = await this.jobs
      .createQueryBuilder("job")
      .where("job.organizationId = :organizationId", {
        organizationId: organization.id,
      })
      .getMany();
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
    const stageCounts = jobIds.length
      ? await this.applications
          .createQueryBuilder("application")
          .select(pipelineStage, "status")
          .addSelect("COUNT(*)", "count")
          .where("application.jobId IN (:...jobIds)", { jobIds })
          .groupBy(pipelineStage)
          .getRawMany<{ status: string; count: string }>()
      : [];
    const recentApplications =
      jobIds.length &&
      user.employerApprovalStatus === EmployerApprovalStatus.APPROVED
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
    const limits = this.limitsFor(organization);
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
        jobsRemaining: Math.max(0, limits.activeJobs - activeJobs),
      },
      recentApplications:
        user.employerApprovalStatus === EmployerApprovalStatus.APPROVED
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
      })),
      total,
      page: safePage,
      limit: safeLimit,
      limits: this.limitsFor(organization),
    };
  }

  async createJob(
    user: AuthenticatedUser,
    dto: CreateEmployerJobDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, JOB_MANAGERS);
    this.validateSalary(dto.salaryMin, dto.salaryMax);
    const job = await this.jobs.save(
      this.jobs.create({
        ...dto,
        title: dto.title.trim(),
        company: context.organization.name,
        location: dto.location.trim(),
        workplaceType: dto.workplaceType ?? "onsite",
        employmentType: dto.employmentType ?? "full-time",
        salaryMin: dto.salaryMin ?? null,
        salaryMax: dto.salaryMax ?? null,
        salaryCurrency: dto.salaryCurrency ?? "INR",
        salaryPeriod: dto.salaryPeriod ?? "year",
        applicationDeadline: dto.applicationDeadline ?? null,
        numberOfOpenings: dto.numberOfOpenings ?? 1,
        experience: dto.experience?.trim() || null,
        description: dto.description?.trim() || null,
        isActive: false,
        employerUserId: user.id,
        organizationId: context.organization.id,
      }),
    );
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.job_created",
      targetType: "job",
      targetId: job.id,
      details: { organizationId: context.organization.id, title: job.title },
    });
    return job;
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
    this.validateSalary(
      dto.salaryMin === undefined ? job.salaryMin : dto.salaryMin,
      dto.salaryMax === undefined ? job.salaryMax : dto.salaryMax,
    );
    if (dto.title !== undefined) job.title = dto.title.trim();
    if (dto.location !== undefined) job.location = dto.location.trim();
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
    const saved = await this.jobs.save(job);
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.job_updated",
      targetType: "job",
      targetId: job.id,
      details: { organizationId: context.organization.id },
    });
    return saved;
  }

  async publishJob(
    user: AuthenticatedUser,
    jobId: number,
    organizationId?: number,
  ) {
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
        await this.assertJobQuota(organization, jobs);
        job.isActive = true;
        return { job: await jobs.save(job), published: true };
      },
    );
    if (!published) return { job, alertResult: { sent: 0, failed: 0 } };
    const alertResult = await this.jobsService.notifyMatchingCandidates(job);
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
    const job = await this.findOrganizationJob(jobId, context.organization.id);
    job.isActive = false;
    const saved = await this.jobs.save(job);
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.job_closed",
      targetType: "job",
      targetId: job.id,
      details: { organizationId: context.organization.id },
    });
    return saved;
  }

  async listApplicants(
    user: AuthenticatedUser,
    query: EmployerApplicantsQueryDto,
    organizationId?: number,
  ) {
    const { organization } = await this.getContext(user.id, organizationId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const builder = this.applications
      .createQueryBuilder("application")
      .innerJoinAndSelect("application.job", "job")
      .innerJoinAndSelect("application.user", "candidate")
      .where("job.organizationId = :organizationId", {
        organizationId: organization.id,
      })
      .orderBy("application.createdAt", "DESC");
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
    if (query.q?.trim()) {
      builder.andWhere(
        "(candidate.displayName ILIKE :q OR job.title ILIKE :q OR application.coverLetter ILIKE :q)",
        { q: `%${query.q.trim()}%` },
      );
    }
    const [items, total] = await builder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const applicationIds = items.map((application) => application.id);
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
            order: { startsAt: "ASC" },
          })
        : Promise.resolve([]);
    const [histories, notes, tags, interviews] = await Promise.all([
      historyPromise,
      notesPromise,
      tagsPromise,
      interviewsPromise,
    ]);
    const [offers, messages] = await Promise.all([
      applicationIds.length
        ? this.offers.find({
            where: applicationIds.map((applicationId) => ({ applicationId })),
          })
        : Promise.resolve([]),
      applicationIds.length
        ? this.messages.find({
            where: applicationIds.map((applicationId) => ({ applicationId })),
            relations: { sender: true },
            order: { createdAt: "ASC", id: "ASC" },
          })
        : Promise.resolve([]),
    ]);
    const fileLinks = await Promise.all(
      items.map((application) =>
        application.resumePath
          ? this.fileStorage.createSignedUrl(application.resumePath)
          : Promise.resolve(null),
      ),
    );
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
      items: items.map((application, index) => ({
        id: application.id,
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
        createdAt: application.createdAt,
        candidateName:
          application.profileShared &&
          typeof application.profileSnapshot?.displayName === "string"
            ? application.profileSnapshot.displayName
            : application.user.displayName,
        profile: application.profileShared ? application.profileSnapshot : null,
        resumeUrl: fileLinks[index],
        resumeFileName: application.resumeFileName,
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
        messages: messages
          .filter((message) => message.applicationId === application.id)
          .map((message) => ({
            id: message.id,
            message: message.message,
            senderUserId: message.senderUserId,
            senderName: message.sender.displayName,
            createdAt: message.createdAt,
          })),
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
        interviews: interviews.filter(
          (entry) => entry.applicationId === application.id,
        ),
      })),
      total,
      page,
      limit,
    };
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

  async createApplicationOffer(
    user: AuthenticatedUser,
    applicationId: number,
    dto: CreateEmployerOfferDto,
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
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
        !["submitted", "in_review", "interview"].includes(application.status)
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
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, APPLICATION_MANAGERS);
    await this.assertApplicationBelongsToOrganization(
      applicationId,
      context.organization.id,
    );
    const items = await this.messages.find({
      where: { applicationId },
      relations: { sender: true },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return items.map((message) => ({
      id: message.id,
      message: message.message,
      senderUserId: message.senderUserId,
      senderName: message.sender.displayName,
      createdAt: message.createdAt,
    }));
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
    const message = await this.messages.save(
      this.messages.create({
        applicationId,
        senderUserId: user.id,
        message: messageText,
      }),
    );
    await this.addNotification(
      application.userId,
      "application_message",
      "New message from the hiring team",
      `The hiring team sent you a message about ${application.job.title}.`,
      "/#dashboard/applications",
    );
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.application_message_sent",
      targetType: "application",
      targetId: applicationId,
      details: { organizationId: context.organization.id },
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
    const note = await this.notes.save(
      this.notes.create({
        organizationId: context.organization.id,
        applicationId,
        authorUserId: user.id,
        note: dto.note.trim(),
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
    const startsAt = new Date(dto.startsAt);
    if (
      !Number.isFinite(startsAt.getTime()) ||
      startsAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException("Choose an interview time in the future.");
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
        if (
          !["submitted", "in_review", "interview"].includes(application.status)
        )
          throw new BadRequestException(
            `An interview cannot be scheduled for an application in the ${application.status} stage.`,
          );
        const interview = await manager.getRepository(EmployerInterview).save({
          organizationId: context.organization.id,
          applicationId,
          scheduledByUserId: user.id,
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
    let notificationStatus: "sent" | "disabled" | "failed" = "disabled";
    const candidateProfile = await this.dataSource
      .getRepository(CandidateProfile)
      .findOneBy({ userId: application.userId });
    if (candidateProfile?.applicationEmailUpdates ?? true) {
      try {
        await this.emailDelivery.sendNotification(
          application.user.email,
          `Interview invitation: ${application.job.title}`,
          `The hiring team at ${context.organization.name} scheduled an interview for ${application.job.title} on ${startsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.${interview.meetingUrl ? ` Join here: ${interview.meetingUrl}` : ""}${interview.location ? ` Location: ${interview.location}` : ""}`,
        );
        notificationStatus = "sent";
      } catch (error) {
        notificationStatus = "failed";
        this.logger.error(
          `Interview ${interview.id} was saved but its invitation email could not be delivered: ${
            error instanceof Error ? error.message : "unknown email error"
          }`,
        );
      }
    }
    await this.addNotification(
      application.userId,
      "interview_scheduled",
      "Interview scheduled",
      `An interview was scheduled for ${application.job.title}. Your application is now in the Interview stage.`,
      "/#dashboard/applications",
    );
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
        notificationStatus,
      },
    });
    return { ...interview, notificationStatus };
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
    interview.status = "cancelled";
    const saved = await this.interviews.save(interview);
    const application = await this.getApplicationWithCandidate(
      interview.applicationId,
      context.organization.id,
    );
    let notificationStatus: "sent" | "disabled" | "failed" = "disabled";
    const candidateProfile = await this.dataSource
      .getRepository(CandidateProfile)
      .findOneBy({ userId: application.userId });
    if (candidateProfile?.applicationEmailUpdates ?? true) {
      try {
        await this.emailDelivery.sendNotification(
          application.user.email,
          `Interview cancelled: ${application.job.title}`,
          `The interview for ${application.job.title} at ${context.organization.name} has been cancelled. Contact the hiring team if you need more information.`,
        );
        notificationStatus = "sent";
      } catch (error) {
        notificationStatus = "failed";
        this.logger.error(
          `Interview ${interview.id} was cancelled but the candidate notification could not be delivered: ${
            error instanceof Error ? error.message : "unknown email error"
          }`,
        );
      }
    }
    await this.addNotification(
      application.userId,
      "interview_cancelled",
      "Interview cancelled",
      `The interview for ${application.job.title} was cancelled.`,
      "/#dashboard/notifications",
    );
    await this.auditService.record({
      actorUserId: user.id,
      action: "employer.interview_cancelled",
      targetType: "interview",
      targetId: saved.id,
      details: {
        organizationId: context.organization.id,
        applicationId: interview.applicationId,
        notificationStatus,
      },
    });
    return { ...saved, notificationStatus };
  }

  async listInterviews(user: AuthenticatedUser, organizationId?: number) {
    const { organization } = await this.getContext(user.id, organizationId);
    const items = await this.interviews.find({
      where: { organizationId: organization.id },
      relations: { application: { job: true, user: true } },
      order: { startsAt: "ASC" },
      take: 100,
    });
    return items.map((interview) => ({
      ...interview,
      candidateName: interview.application.user.displayName,
      jobTitle: interview.application.job.title,
    }));
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
      const limits = this.limitsFor(organization);
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
    try {
      await this.emailDelivery.sendNotification(
        email,
        `Invitation to join ${context.organization.name} on esllp`,
        this.teamInvitationMessage(
          context.organization.name,
          dto.role,
          existingUser,
          invitationUrl,
        ),
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
    try {
      await this.emailDelivery.sendNotification(
        updated.member.email,
        `Invitation to join ${context.organization.name} on esllp`,
        this.teamInvitationMessage(
          context.organization.name,
          updated.member.role,
          existingUser,
          invitationUrl,
        ),
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
  ) {
    const roleName = role.replace(/_/g, " ");
    const nextStep = existingUser
      ? existingUser.employerApprovalStatus === EmployerApprovalStatus.APPROVED
        ? "Sign in with this email address and accept the invitation."
        : "Sign in with this email address to view a read-only workspace preview. The invitation becomes available after an administrator approves your employer account."
      : "Register as an employer using this link and the invited email address. Verify your email to view a read-only workspace preview while waiting for administrator approval.";
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

  async billingSummary(user: AuthenticatedUser, organizationId?: number) {
    const { organization, membership } = await this.getContext(
      user.id,
      organizationId,
    );
    const plans = this.planCatalog();
    return {
      currency: "INR",
      provider: "razorpay",
      plans,
      current: {
        planKey: organization.planKey,
        status: organization.subscriptionStatus,
        currentPeriodEnd: organization.subscriptionCurrentPeriodEnd,
        canManage: [
          OrganizationMemberRole.OWNER,
          OrganizationMemberRole.BILLING,
        ].includes(membership.role),
      },
      checkoutReady: Boolean(
        process.env.RAZORPAY_KEY_ID?.trim() &&
        process.env.RAZORPAY_KEY_SECRET?.trim(),
      ),
    };
  }

  async createSubscription(
    user: AuthenticatedUser,
    planKey: "starter" | "growth",
    organizationId?: number,
  ) {
    const context = await this.getContext(user.id, organizationId);
    this.requireRole(context.membership, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.BILLING,
    ]);
    const plan = this.planCatalog().find((item) => item.key === planKey);
    if (!plan?.razorpayPlanId)
      throw new ServiceUnavailableException(
        `Configure RAZORPAY_PLAN_${planKey.toUpperCase()} before enabling this plan.`,
      );
    if (plan.amountInr === null || plan.amountInr <= 0)
      throw new ServiceUnavailableException(
        `Set a positive EMPLOYER_${planKey.toUpperCase()}_PRICE_INR matching the Razorpay plan before enabling checkout.`,
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
        `The configured Razorpay ${planKey} plan must be monthly in INR and match EMPLOYER_${planKey.toUpperCase()}_PRICE_INR.`,
      );
    const checkout = await this.dataSource.transaction(async (manager) => {
      const organizations = manager.getRepository(EmployerOrganization);
      const organization = await organizations.findOne({
        where: { id: context.organization.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!organization)
        throw new NotFoundException("Company workspace was not found.");

      if (organization.pendingRazorpaySubscriptionId) {
        if (organization.pendingPlanKey !== planKey) {
          throw new ConflictException(
            "A checkout for another plan is already awaiting payment.",
          );
        }
        const pendingId = organization.pendingRazorpaySubscriptionId;
        const pendingResponse = await this.razorpayRequest(
          `/subscriptions/${encodeURIComponent(pendingId)}`,
          { method: "GET" },
        );
        if (pendingResponse.status !== 404) {
          const pendingSubscription =
            await this.readProviderResponse(pendingResponse);
          if (
            typeof pendingSubscription.id === "string" &&
            ["created", "authenticated", "active"].includes(
              String(pendingSubscription.status),
            )
          ) {
            return {
              keyId: process.env.RAZORPAY_KEY_ID!.trim(),
              subscriptionId: pendingSubscription.id,
              planKey,
              companyName: organization.name,
              email: user.email,
              amountInr: plan.amountInr,
            };
          }
        }
        organization.pendingPlanKey = null;
        organization.pendingRazorpaySubscriptionId = null;
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
      const response = await this.razorpayRequest("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          plan_id: plan.razorpayPlanId,
          total_count: 120,
          customer_notify: 1,
          notes: {
            organizationId: String(organization.id),
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
      organization.pendingPlanKey = planKey;
      organization.pendingRazorpaySubscriptionId = payload.id;
      await organizations.save(organization);
      return {
        keyId: process.env.RAZORPAY_KEY_ID!.trim(),
        subscriptionId: payload.id,
        planKey,
        companyName: organization.name,
        email: user.email,
        amountInr: plan.amountInr,
      };
    });
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
    const secret = this.requireRazorpaySecret();
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
      if (
        subscriptionNotes.planKey !== planKey ||
        (planKey !== "starter" && planKey !== "growth")
      )
        throw new ForbiddenException(
          "The Razorpay subscription plan does not match this company.",
        );
      if (subscription.status === "active") {
        organization.planKey = planKey;
        organization.subscriptionStatus = "active";
        organization.razorpaySubscriptionId = payload.razorpay_subscription_id;
        organization.pendingPlanKey = null;
        organization.pendingRazorpaySubscriptionId = null;
        organization.subscriptionCurrentPeriodEnd = this.epochDate(
          subscription.current_end,
        );
        await organizations.save(organization);
        await this.enforceJobQuota(organization, manager.getRepository(Job));
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

  async handleRazorpayWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    eventId: string | undefined,
    body: Record<string, unknown>,
  ) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
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
    return this.dataSource.transaction(async (manager) => {
      const inserted = (await manager.query(
        `INSERT INTO razorpay_webhook_events (event_id)
         VALUES ($1)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [normalizedEventId],
      )) as Array<{ event_id: string }>;
      if (inserted.length === 0) return { received: true, duplicate: true };

      const payload = asJsonObject(body.payload);
      const subscriptionPayload = asJsonObject(payload?.subscription);
      const subscription = asJsonObject(subscriptionPayload?.entity);
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
      if (!organization) return { received: true, ignored: true };

      const pending =
        organization.pendingRazorpaySubscriptionId === subscriptionId;
      const planKey = pending
        ? organization.pendingPlanKey
        : organization.planKey;
      let reconcileJobs = false;
      switch (body.event) {
        case "subscription.activated":
        case "subscription.charged":
        case "subscription.resumed":
          if (pending && planKey) {
            organization.planKey = planKey;
            organization.razorpaySubscriptionId = subscriptionId;
            organization.pendingPlanKey = null;
            organization.pendingRazorpaySubscriptionId = null;
          }
          organization.subscriptionStatus = "active";
          organization.subscriptionCurrentPeriodEnd =
            this.epochDate(subscription.current_end) ??
            organization.subscriptionCurrentPeriodEnd;
          await organizations.save(organization);
          reconcileJobs = true;
          break;
        case "subscription.halted":
          organization.subscriptionStatus = "past_due";
          await organizations.save(organization);
          reconcileJobs = true;
          break;
        case "subscription.cancelled":
        case "subscription.completed":
          if (pending) {
            organization.pendingPlanKey = null;
            organization.pendingRazorpaySubscriptionId = null;
          } else {
            organization.planKey = "free";
            organization.subscriptionStatus = "free";
            organization.razorpaySubscriptionId = null;
            organization.subscriptionCurrentPeriodEnd = null;
          }
          await organizations.save(organization);
          reconcileJobs = !pending;
          break;
        default:
          break;
      }
      if (reconcileJobs)
        await this.enforceJobQuota(organization, manager.getRepository(Job));
      return { received: true };
    });
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
      (user.employerApprovalStatus !== EmployerApprovalStatus.APPROVED &&
        !(
          allowPending &&
          user.employerApprovalStatus === EmployerApprovalStatus.PENDING
        ))
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

  private limitsFor(organization: EmployerOrganization) {
    const paidPlanActive =
      organization.planKey !== "free" &&
      ["active", "cancel_pending"].includes(organization.subscriptionStatus);
    const key = paidPlanActive
      ? (organization.planKey as keyof typeof PLAN_LIMITS)
      : "free";
    return PLAN_LIMITS[key] ?? PLAN_LIMITS.free;
  }

  private async assertJobQuota(
    organization: EmployerOrganization,
    jobs: Repository<Job> = this.jobs,
  ) {
    const limits = this.limitsFor(organization);
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
  ) {
    const limit = this.limitsFor(organization).activeJobs;
    const activeJobs = await jobs.find({
      where: { organizationId: organization.id, isActive: true },
      order: { createdAt: "DESC", id: "DESC" },
    });
    const excessJobs = activeJobs.slice(limit);
    if (excessJobs.length) {
      for (const job of excessJobs) job.isActive = false;
      await jobs.save(excessJobs);
    }
  }

  private async findOrganizationJob(jobId: number, organizationId: number) {
    const job = await this.jobs.findOneBy({ id: jobId, organizationId });
    if (!job) throw new NotFoundException("Job was not found in this company.");
    return job;
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

  private planCatalog() {
    const plan = (
      key: "free" | "starter" | "growth",
      name: string,
      activeJobs: number,
      seats: number,
      planEnv?: string,
      amountEnv?: string,
    ) => ({
      key,
      name,
      currency: "INR",
      amountInr: amountEnv ? this.readOptionalAmount(amountEnv) : 0,
      activeJobs,
      seats,
      razorpayPlanId: planEnv ? process.env[planEnv]?.trim() || null : null,
    });
    return [
      plan("free", "Free", 1, 1),
      plan(
        "starter",
        "Starter",
        3,
        3,
        "RAZORPAY_PLAN_STARTER",
        "EMPLOYER_STARTER_PRICE_INR",
      ),
      plan(
        "growth",
        "Growth",
        10,
        10,
        "RAZORPAY_PLAN_GROWTH",
        "EMPLOYER_GROWTH_PRICE_INR",
      ),
    ];
  }

  private readOptionalAmount(name: string): number | null {
    const value = process.env[name]?.trim();
    if (!value) return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0)
      throw new ServiceUnavailableException(
        `${name} must be a non-negative INR amount.`,
      );
    return amount;
  }

  private async razorpayRequest(
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const keyId = process.env.RAZORPAY_KEY_ID?.trim();
    const secret = this.requireRazorpaySecret();
    if (!keyId)
      throw new ServiceUnavailableException(
        "Razorpay key ID is not configured.",
      );
    return fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
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

  private requireRazorpaySecret() {
    const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!secret)
      throw new ServiceUnavailableException(
        "Razorpay key secret is not configured.",
      );
    return secret;
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
