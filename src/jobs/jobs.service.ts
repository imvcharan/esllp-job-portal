import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";
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
import { CandidateSavedSearchesService } from "../users/candidate-saved-searches.service";
import { currentJobDeadlineDate } from "./job.constants";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(CandidateProfile)
    private readonly profilesRepository: Repository<CandidateProfile>,
    @InjectRepository(EmployerOrganizationMember)
    private readonly organizationMembers: Repository<EmployerOrganizationMember>,
    private readonly auditService: AuditService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly savedSearchesService: CandidateSavedSearchesService,
  ) {}

  async findAll(filters: {
    query?: string;
    location?: string;
    page?: number;
    limit?: number;
    workplaceType?: string;
    employmentType?: string;
    experience?: string;
    company?: string;
    minimumSalary?: number;
    salaryCurrency?: string;
    salaryPeriod?: string;
    freshnessDays?: number;
    sort?: string;
  }) {
    const page = Math.min(1_000_000, Math.max(1, filters.page ?? 1));
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const queryBuilder = this.jobsRepository
      .createQueryBuilder("job")
      .where("job.isActive = :isActive", { isActive: true })
      .andWhere(
        "(job.applicationDeadline IS NULL OR job.applicationDeadline >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)",
      )
      .take(limit)
      .skip((page - 1) * limit);

    const query = filters.query?.trim();
    if (query) {
      queryBuilder.andWhere(
        new Brackets((where) => {
          where
            .where("job.title ILIKE :query", { query: `%${query}%` })
            .orWhere("job.company ILIKE :query", { query: `%${query}%` })
            .orWhere("job.description ILIKE :query", { query: `%${query}%` });
        }),
      );
    }

    const location = filters.location?.trim();
    if (location) {
      queryBuilder.andWhere("job.location ILIKE :location", {
        location: `%${location}%`,
      });
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

    if (filters.sort === "salary") {
      queryBuilder
        .orderBy("job.salaryCurrency", "ASC")
        .addOrderBy("job.salaryPeriod", "ASC")
        .addOrderBy(
          "COALESCE(job.salaryMax, job.salaryMin)",
          "DESC",
          "NULLS LAST",
        )
        .addOrderBy("job.createdAt", "DESC");
    } else if (filters.sort === "title") {
      queryBuilder
        .orderBy("job.title", "ASC")
        .addOrderBy("job.createdAt", "DESC");
    } else {
      queryBuilder.orderBy("job.createdAt", "DESC");
    }

    const [items, total] = await queryBuilder.getManyAndCount();
    const companies = await this.jobsRepository
      .createQueryBuilder("job")
      .select("DISTINCT job.company", "company")
      .where("job.isActive = :isActive", { isActive: true })
      .andWhere(
        "(job.applicationDeadline IS NULL OR job.applicationDeadline >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)",
      )
      .orderBy("job.company", "ASC")
      .getRawMany<{ company: string }>();
    return {
      items,
      total,
      page,
      limit,
      companies: companies.map(({ company }) => company),
    };
  }

  findAllForAdministration(): Promise<Job[]> {
    return this.jobsRepository.find({ order: { createdAt: "DESC" } });
  }

  async create(
    dto: CreateJobDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<
    Job & { notificationDelivery?: { sent: number; failed: number } }
  > {
    this.assertDeadlineAllowsPublishing(dto.isActive, dto.applicationDeadline);
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
    const job = await this.jobsRepository.save(
      this.jobsRepository.create({
        ...dto,
        title: dto.title.trim(),
        company: dto.company.trim(),
        location: dto.location.trim(),
        workplaceType: dto.workplaceType ?? "onsite",
        employmentType: dto.employmentType ?? "full-time",
        salaryMin,
        salaryMax,
        salaryCurrency: dto.salaryCurrency ?? "INR",
        salaryPeriod: dto.salaryPeriod ?? "year",
        applicationDeadline: dto.applicationDeadline ?? null,
        numberOfOpenings: dto.numberOfOpenings ?? 1,
        experience: dto.experience?.trim() || null,
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? false,
        organizationId: employerOrganizationId,
      }),
    );
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
    const notificationDelivery = await this.notifyMatchingCandidates(job);
    return Object.assign(job, { notificationDelivery });
  }

  async update(
    id: number,
    dto: UpdateJobDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<
    (Job & { notificationDelivery?: { sent: number; failed: number } }) | null
  > {
    const job = await this.jobsRepository.findOneBy({ id });
    if (!job) {
      return null;
    }
    if (dto.employerUserId !== undefined) {
      job.organizationId = await this.getEmployerOrganizationId(
        dto.employerUserId,
      );
    }
    const wasActive = job.isActive;
    const nextDeadline =
      dto.applicationDeadline === undefined
        ? job.applicationDeadline
        : dto.applicationDeadline;
    this.assertDeadlineAllowsPublishing(dto.isActive, nextDeadline);
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
    if (dto.title !== undefined) job.title = dto.title.trim();
    if (dto.company !== undefined) job.company = dto.company.trim();
    if (dto.location !== undefined) job.location = dto.location.trim();
    if (dto.experience !== undefined)
      job.experience = dto.experience?.trim() || null;
    if (dto.description !== undefined)
      job.description = dto.description?.trim() || null;
    const saved = await this.jobsRepository.save(job);
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
    const notificationDelivery = await this.notifyMatchingCandidates(saved);
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
    const archived = await this.jobsRepository.save(job);
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

  async notifyMatchingCandidates(job: Job) {
    try {
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
        return roleMatches && workplaceMatches && employmentMatches;
      });
      let savedSearches: Awaited<
        ReturnType<CandidateSavedSearchesService["matchingForJob"]>
      > = [];
      let savedSearchFailure = 0;
      try {
        savedSearches = await this.savedSearchesService.matchingForJob(job);
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
      if (!userIds.length) return { sent: 0, failed: savedSearchFailure };
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
            `New job matching your preferences: ${job.title}`,
            `${job.title} at ${job.company} in ${job.location} matches your saved job preferences${matchingSearches.has(recipient.id) ? ` (${matchingSearches.get(recipient.id)?.join(", ")})` : ""}.${jobUrl ? ` View this listing: ${jobUrl}` : ""}`,
          ),
        ),
      );
      const sent = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const failed = results.length - sent + savedSearchFailure;
      if (failed) {
        this.logger.error(
          `${failed} job alert email(s) could not be delivered for job ${job.id}.`,
        );
      }
      return { sent, failed };
    } catch (error) {
      this.logger.error(
        `Job alerts could not be processed for job ${job.id}: ${
          error instanceof Error ? error.message : "unknown notification error"
        }`,
      );
      return { sent: 0, failed: 1 };
    }
  }
}
