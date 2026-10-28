import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, QueryFailedError, Repository } from "typeorm";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { EmployerOrganization } from "../employers/organization.entity";
import { Job } from "../jobs/job.entity";
import { User } from "../users/user.entity";
import { CreateReportDto } from "./dto/create-report.dto";
import { UpdateReportDto } from "./dto/update-report.dto";
import { Report, ReportStatus, ReportTargetType } from "./report.entity";

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly reportsRepository: Repository<Report>,
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    @InjectRepository(EmployerOrganization)
    private readonly organizationsRepository: Repository<EmployerOrganization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateReportDto,
    ipAddress?: string,
  ) {
    await this.assertTargetExists(user, dto.targetType, dto.targetId);
    const duplicate = await this.reportsRepository.findOneBy({
      reporterUserId: user.id,
      targetType: dto.targetType,
      targetId: dto.targetId,
      status: In([ReportStatus.OPEN, ReportStatus.REVIEWING]),
    });
    if (duplicate) {
      throw new ConflictException(
        "You already have an open report for this item.",
      );
    }

    let report: Report;
    try {
      report = await this.reportsRepository.save(
        this.reportsRepository.create({
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
          details: dto.details?.trim() || null,
          status: ReportStatus.OPEN,
          resolutionNote: null,
          reporterUserId: user.id,
          resolvedByUserId: null,
        }),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        typeof error.driverError === "object" &&
        error.driverError !== null &&
        "code" in error.driverError &&
        error.driverError.code === "23505"
      ) {
        throw new ConflictException(
          "You already have an open report for this item.",
        );
      }
      throw error;
    }

    await this.auditService.record({
      actorUserId: user.id,
      action: "report.created",
      targetType: dto.targetType,
      targetId: dto.targetId,
      details: { reportId: report.id, reason: report.reason },
      ipAddress,
    });
    return { id: report.id, status: report.status };
  }

  async list(page = 1, limit = 25, status?: ReportStatus) {
    const safePage = Math.min(1_000_000, Math.max(1, page));
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [items, total] = await this.reportsRepository.findAndCount({
      where: status ? { status } : {},
      order: { createdAt: "DESC", id: "DESC" },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    const jobIds = items
      .filter((item) => item.targetType === ReportTargetType.JOB)
      .map((item) => item.targetId);
    const organizationIds = items
      .filter((item) => item.targetType === ReportTargetType.COMPANY)
      .map((item) => item.targetId);
    const userIds = items
      .filter((item) => item.targetType === ReportTargetType.USER)
      .map((item) => item.targetId);
    const jobsPromise: Promise<Job[]> = jobIds.length
      ? this.jobsRepository.find({
          select: { id: true, title: true, company: true },
          where: { id: In(jobIds) },
        })
      : Promise.resolve([]);
    const organizationsPromise: Promise<EmployerOrganization[]> =
      organizationIds.length
        ? this.organizationsRepository.find({
            select: { id: true, name: true },
            where: { id: In(organizationIds) },
          })
        : Promise.resolve([]);
    const [jobs, organizations] = await Promise.all([
      jobsPromise,
      organizationsPromise,
    ]);
    const targets = new Map<string, { label: string }>();
    jobs.forEach((job) =>
      targets.set(`${ReportTargetType.JOB}:${job.id}`, {
        label: `${job.title} · ${job.company}`,
      }),
    );
    organizations.forEach((organization) =>
      targets.set(`${ReportTargetType.COMPANY}:${organization.id}`, {
        label: organization.name,
      }),
    );
    userIds.forEach((userId) =>
      targets.set(`${ReportTargetType.USER}:${userId}`, {
        label: `Account #${userId}`,
      }),
    );
    return {
      items: items.map((item) => ({
        ...item,
        target: targets.get(`${item.targetType}:${item.targetId}`) ?? null,
      })),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async update(
    id: number,
    dto: UpdateReportDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const report = await this.reportsRepository.findOneBy({ id });
    if (!report) throw new NotFoundException("Report was not found.");
    if (
      report.status === ReportStatus.ACTIONED ||
      report.status === ReportStatus.DISMISSED
    ) {
      throw new BadRequestException("A completed report cannot be changed.");
    }
    if (
      dto.status === ReportStatus.ACTIONED &&
      report.status !== ReportStatus.REVIEWING
    ) {
      throw new BadRequestException(
        "Move a report to review before recording action.",
      );
    }

    report.status = dto.status;
    report.resolutionNote = dto.resolutionNote?.trim() || null;
    report.resolvedByUserId =
      dto.status === ReportStatus.ACTIONED ||
      dto.status === ReportStatus.DISMISSED
        ? actor.id
        : null;
    const updated = await this.reportsRepository.save(report);
    await this.auditService.record({
      actorUserId: actor.id,
      action: `report.${updated.status}`,
      targetType: "report",
      targetId: updated.id,
      details: {
        reportedType: updated.targetType,
        reportedId: updated.targetId,
      },
      ipAddress,
    });
    return updated;
  }

  private async assertTargetExists(
    reporter: AuthenticatedUser,
    targetType: ReportTargetType,
    targetId: number,
  ): Promise<void> {
    let exists = false;
    if (targetType === ReportTargetType.JOB) {
      exists = Boolean(await this.jobsRepository.findOneBy({ id: targetId }));
    } else if (targetType === ReportTargetType.COMPANY) {
      exists = Boolean(
        await this.organizationsRepository.findOneBy({ id: targetId }),
      );
    } else if (targetType === ReportTargetType.USER) {
      if (targetId === reporter.id) {
        throw new BadRequestException("You cannot report your own account.");
      }
      exists = Boolean(
        await this.usersRepository.findOneBy({ id: targetId, isActive: true }),
      );
    }
    if (!exists)
      throw new NotFoundException("The item to report was not found.");
  }
}
