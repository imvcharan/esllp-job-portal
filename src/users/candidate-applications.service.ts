import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { EmailDeliveryService } from "../auth/email-delivery.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { Job } from "../jobs/job.entity";
import { CandidateFileStorageService } from "./candidate-file-storage.service";
import { CandidateApplication } from "./candidate-application.entity";
import { CandidateApplicationStatus } from "./candidate-application-status.entity";
import { CandidateProfile } from "./candidate-profile.entity";
import { SubmitCandidateApplicationDto } from "./dto/submit-candidate-application.dto";
import { User, UserRole } from "./user.entity";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";
import { UserNotification } from "../employers/user-notification.entity";
import { currentJobDeadlineDate } from "../jobs/job.constants";
import { AuditService } from "../audit/audit.service";

const EMPLOYER_TRANSITIONS: Record<string, string[]> = {
  submitted: ["in_review", "interview", "offer", "rejected"],
  in_review: ["interview", "offer", "rejected"],
  interview: ["offer", "rejected"],
};

@Injectable()
export class CandidateApplicationsService {
  private readonly logger = new Logger(CandidateApplicationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CandidateApplication)
    private readonly applicationsRepository: Repository<CandidateApplication>,
    @InjectRepository(CandidateApplicationStatus)
    private readonly statusesRepository: Repository<CandidateApplicationStatus>,
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    @InjectRepository(CandidateProfile)
    private readonly profilesRepository: Repository<CandidateProfile>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(EmployerOrganizationMember)
    private readonly organizationMembers: Repository<EmployerOrganizationMember>,
    @InjectRepository(UserNotification)
    private readonly notificationsRepository: Repository<UserNotification>,
    private readonly fileStorage: CandidateFileStorageService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly auditService: AuditService,
  ) {}

  async list(user: AuthenticatedUser, requestedPage = 1, requestedLimit = 20) {
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const page = Math.min(1_000_000, Math.max(1, requestedPage));
    const [applications, total] = await this.applicationsRepository
      .createQueryBuilder("application")
      .innerJoinAndSelect("application.job", "job")
      .where("application.userId = :userId", { userId: user.id })
      .orderBy("application.createdAt", "DESC")
      .addOrderBy("application.id", "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const histories = await this.getHistories(applications);
    return {
      items: applications.map((application) =>
        this.toCandidateResponse(
          application,
          histories.get(application.id) ?? [],
        ),
      ),
      total,
      page,
      limit,
    };
  }

  async getForJob(user: AuthenticatedUser, jobId: number) {
    const application = await this.applicationsRepository.findOne({
      where: { userId: user.id, jobId },
      relations: { job: true },
    });
    if (!application) return { application: null };
    const histories = await this.getHistories([application]);
    return {
      application: this.toCandidateResponse(
        application,
        histories.get(application.id) ?? [],
      ),
    };
  }

  async submit(
    user: AuthenticatedUser,
    jobId: number,
    dto: SubmitCandidateApplicationDto,
  ) {
    const existingApplication = await this.applicationsRepository.findOne({
      where: { userId: user.id, jobId },
      relations: { job: true },
    });
    if (existingApplication) {
      return this.toCandidateResponse(
        existingApplication,
        (await this.getHistories([existingApplication])).get(
          existingApplication.id,
        ) ?? [],
      );
    }

    const job = await this.jobsRepository.findOneBy({
      id: jobId,
      isActive: true,
    });
    if (!job) {
      throw new NotFoundException(`Published job ${jobId} was not found`);
    }
    const profile = await this.profilesRepository.findOneBy({
      userId: user.id,
    });
    const includeResume = dto.includeResume === true;
    const shareProfile = dto.shareProfile === true;
    if (includeResume && !profile?.resumePath) {
      throw new BadRequestException(
        "Upload a resume to your profile before choosing to include it.",
      );
    }
    if (shareProfile && !profile?.shareProfileOnApplication) {
      throw new BadRequestException(
        "Enable profile sharing in your profile preferences before sharing it with an application.",
      );
    }
    const account = await this.usersRepository.findOneBy({
      id: user.id,
      isActive: true,
    });
    if (!account)
      throw new NotFoundException("Candidate account was not found");

    let created = false;
    await this.dataSource.transaction(async (manager) => {
      const lockedJob = await manager
        .getRepository(Job)
        .createQueryBuilder("job")
        .where("job.id = :jobId", { jobId })
        .andWhere("job.isActive = :isActive", { isActive: true })
        .andWhere(
          "(job.applicationDeadline IS NULL OR job.applicationDeadline >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)",
        )
        .setLock("pessimistic_write")
        .getOne();
      if (!lockedJob?.isActive) {
        throw new NotFoundException(`Published job ${jobId} was not found`);
      }

      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(CandidateApplication)
        .values({
          userId: user.id,
          jobId,
          coverLetter: dto.coverLetter?.trim() || null,
          status: "submitted",
          resumePath: includeResume ? profile!.resumePath : null,
          resumeFileName: includeResume ? profile!.resumeFileName : null,
          profileShared: shareProfile,
          profileSnapshot: shareProfile
            ? {
                displayName: account.displayName,
                email: account.email,
                headline: profile!.headline,
                location: profile!.location,
                phone: profile!.phone,
                summary: profile!.summary,
                skills: this.parseSkills(profile!.skills),
                experience: profile!.experience,
                education: profile!.education,
                links: profile!.links,
              }
            : null,
        })
        .orIgnore()
        .returning(["id"])
        .execute();
      created = insertResult.identifiers.length > 0;

      const applications = manager.getRepository(CandidateApplication);
      const application = await applications.findOneBy({
        userId: user.id,
        jobId,
      });
      if (!application) {
        throw new Error("Submitted application could not be loaded");
      }
      if (created) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(CandidateApplicationStatus)
          .values({
            applicationId: application.id,
            fromStatus: null,
            toStatus: "submitted",
            note: null,
            changedByUserId: user.id,
          })
          .orIgnore()
          .execute();
      }
    });

    const application = await this.applicationsRepository.findOne({
      where: { userId: user.id, jobId },
      relations: { job: true },
    });
    if (!application) {
      throw new Error("Submitted application could not be loaded");
    }
    if (created) {
      await this.auditService.record({
        actorUserId: user.id,
        action: "candidate.application_submitted",
        targetType: "application",
        targetId: application.id,
        details: { jobId, status: application.status },
      });
      await this.notifyEmployer(application.job);
    }
    return this.toCandidateResponse(application, [
      ...((await this.getHistories([application])).get(application.id) ?? []),
    ]);
  }

  async withdraw(user: AuthenticatedUser, applicationId: number) {
    await this.dataSource.transaction(async (manager) => {
      const applications = manager.getRepository(CandidateApplication);
      const application = await applications.findOne({
        where: { id: applicationId, userId: user.id },
        relations: { job: true },
        lock: { mode: "pessimistic_write" },
      });
      if (!application) {
        throw new NotFoundException("Application was not found");
      }
      if (application.status !== "submitted") {
        throw new BadRequestException(
          "Only applications that are still submitted can be withdrawn.",
        );
      }
      application.status = "withdrawn";
      application.withdrawnAt = new Date();
      await applications.save(application);
      await manager.getRepository(CandidateApplicationStatus).save({
        applicationId,
        fromStatus: "submitted",
        toStatus: "withdrawn",
        note: null,
        changedByUserId: user.id,
      });
    });
    const application = await this.applicationsRepository.findOne({
      where: { id: applicationId, userId: user.id },
      relations: { job: true },
    });
    if (!application) throw new NotFoundException("Application was not found");
    await this.auditService.record({
      actorUserId: user.id,
      action: "candidate.application_withdrawn",
      targetType: "application",
      targetId: application.id,
      details: { jobId: application.jobId },
    });
    const histories = await this.getHistories([application]);
    return this.toCandidateResponse(
      application,
      histories.get(application.id) ?? [],
    );
  }

  async listForEmployer(user: AuthenticatedUser) {
    const applications = await this.applicationsRepository
      .createQueryBuilder("application")
      .innerJoinAndSelect("application.job", "job")
      .innerJoinAndSelect("application.user", "candidate")
      .where("job.employerUserId = :employerId", { employerId: user.id })
      .orderBy("application.createdAt", "DESC")
      .getMany();
    const histories = await this.getHistories(applications);
    return Promise.all(
      applications.map(async (application) => {
        const resumeUrl = application.resumePath
          ? await this.fileStorage.createSignedUrl(application.resumePath)
          : null;
        return {
          id: application.id,
          status: application.status,
          coverLetter: application.coverLetter,
          createdAt: application.createdAt,
          candidateName:
            application.profileShared &&
            typeof application.profileSnapshot?.displayName === "string"
              ? application.profileSnapshot.displayName
              : application.user.displayName,
          profile: application.profileShared
            ? application.profileSnapshot
            : null,
          resumeUrl,
          resumeFileName: application.resumeFileName,
          job: {
            id: application.job.id,
            title: application.job.title,
            company: application.job.company,
          },
          history: histories.get(application.id) ?? [],
        };
      }),
    );
  }

  async updateStatus(
    employer: AuthenticatedUser,
    applicationId: number,
    status: string,
    note?: string,
    organizationId?: number,
  ) {
    if (!["in_review", "interview", "offer", "rejected"].includes(status)) {
      throw new BadRequestException(
        "Choose a valid employer application status.",
      );
    }
    const { application, history } = await this.dataSource.transaction(
      async (manager) => {
        const applications = manager.getRepository(CandidateApplication);
        const application = await applications
          .createQueryBuilder("application")
          .innerJoinAndSelect("application.job", "job")
          .innerJoinAndSelect("application.user", "candidate")
          .where("application.id = :applicationId", { applicationId })
          .andWhere(
            organizationId === undefined
              ? "job.employerUserId = :employerId"
              : "job.organizationId = :organizationId",
            organizationId === undefined
              ? { employerId: employer.id }
              : { organizationId },
          )
          .setLock("pessimistic_write")
          .getOne();
        if (!application) {
          throw new NotFoundException("Application was not found");
        }
        if (!EMPLOYER_TRANSITIONS[application.status]?.includes(status)) {
          throw new BadRequestException(
            `An application cannot move from ${application.status} to ${status}.`,
          );
        }
        const previousStatus = application.status;
        application.status = status;
        await applications.save(application);
        const history = await manager
          .getRepository(CandidateApplicationStatus)
          .save({
            applicationId,
            fromStatus: previousStatus,
            toStatus: status,
            note: note?.trim() || null,
            changedByUserId: employer.id,
          });
        return { application, history };
      },
    );

    let notificationSent = false;
    let notificationStatus: "sent" | "disabled" | "failed" = "disabled";
    const preferences = await this.profilesRepository.findOneBy({
      userId: application.userId,
    });
    if (preferences?.applicationEmailUpdates ?? true) {
      try {
        await this.emailDelivery.sendNotification(
          application.user.email,
          `Application update: ${application.job.title}`,
          `Your application for ${application.job.title} at ${application.job.company} is now ${status.replace("_", " ")}.`,
        );
        notificationSent = true;
        notificationStatus = "sent";
      } catch (error) {
        notificationStatus = "failed";
        this.logger.error(
          `Application ${applicationId} status email could not be delivered: ${
            error instanceof Error ? error.message : "unknown delivery error"
          }`,
        );
      }
    }
    await this.auditService.record({
      actorUserId: employer.id,
      action: "employer.application_status_changed",
      targetType: "application",
      targetId: applicationId,
      details: {
        jobId: application.jobId,
        status,
        notificationStatus,
      },
    });
    return {
      applicationId,
      status,
      changedAt: history.createdAt,
      notificationSent,
      notificationStatus,
    };
  }

  private async getHistories(applications: CandidateApplication[]) {
    if (!applications.length)
      return new Map<number, CandidateApplicationStatus[]>();
    const rows = await this.statusesRepository.find({
      where: applications.map((application) => ({
        applicationId: application.id,
      })),
      order: { createdAt: "ASC", id: "ASC" },
    });
    const histories = new Map<number, CandidateApplicationStatus[]>();
    for (const row of rows) {
      const entries = histories.get(row.applicationId) ?? [];
      entries.push(row);
      histories.set(row.applicationId, entries);
    }
    return histories;
  }

  private toCandidateResponse(
    application: CandidateApplication,
    histories: CandidateApplicationStatus[],
  ) {
    const { job } = application;
    return {
      id: application.id,
      jobId: application.jobId,
      status: application.status,
      coverLetter: application.coverLetter,
      profileShared: application.profileShared,
      resumeIncluded: Boolean(application.resumePath),
      resumeFileName: application.resumeFileName,
      withdrawnAt: application.withdrawnAt,
      createdAt: application.createdAt,
      history: histories.map((entry) => ({
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        note: entry.note,
        createdAt: entry.createdAt,
      })),
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        workplaceType: job.workplaceType,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        experience: job.experience,
        isActive:
          job.isActive &&
          (!job.applicationDeadline ||
            job.applicationDeadline >= currentJobDeadlineDate()),
      },
    };
  }

  private parseSkills(value: string): string[] {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.some((skill) => typeof skill !== "string")
    ) {
      throw new Error("Stored candidate skills have an invalid format");
    }
    return parsed;
  }

  private async notifyEmployer(job: Job) {
    try {
      const memberIds = job.organizationId
        ? [
            ...new Set(
              (
                await this.organizationMembers.find({
                  where: {
                    organizationId: job.organizationId,
                    status: "active",
                  },
                })
              )
                .map((member) => member.userId)
                .filter((id): id is number => id !== null),
            ),
          ]
        : job.employerUserId
          ? [job.employerUserId]
          : [];
      if (!memberIds.length) return;
      const recipients = await this.usersRepository.findBy(
        memberIds.map((id) => ({ id, isActive: true })),
      );
      await this.notificationsRepository.save(
        recipients.map((recipient) =>
          this.notificationsRepository.create({
            userId: recipient.id,
            type: "new_application",
            title: "New application received",
            message: `A candidate applied for ${job.title}.`,
            link: "/#dashboard/applicants",
            readAt: null,
          }),
        ),
      );
      const emails = await Promise.allSettled(
        recipients.map((recipient) =>
          this.emailDelivery.sendNotification(
            recipient.email,
            `New application received: ${job.title}`,
            `A candidate submitted an application for ${job.title} at ${job.company}. Sign in to your esllp employer workspace to review applicants.`,
          ),
        ),
      );
      const failures = emails.filter(
        (result) => result.status === "rejected",
      ).length;
      if (failures) {
        this.logger.error(
          `${failures} employer application notification email(s) could not be delivered for job ${job.id}.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Application notification email could not be delivered for job ${job.id}: ${
          error instanceof Error ? error.message : "unknown delivery error"
        }`,
      );
    }
  }
}
