import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, IsNull, Not, Repository } from "typeorm";
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
import { CandidateApplicationOffer } from "./candidate-application-offer.entity";
import { CandidateApplicationMessage } from "./candidate-application-message.entity";
import { CreateCandidateApplicationMessageDto } from "./dto/create-candidate-application-message.dto";
import { collectApplicationAnswers } from "./application-questions";
import { CandidateApplicationDocument } from "./candidate-application-document.entity";

const EMPLOYER_TRANSITIONS: Record<string, string[]> = {
  submitted: ["in_review", "interview", "rejected"],
  in_review: ["interview", "rejected"],
  interview: ["rejected"],
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
    @InjectRepository(CandidateApplicationOffer)
    private readonly offersRepository: Repository<CandidateApplicationOffer>,
    @InjectRepository(CandidateApplicationMessage)
    private readonly messagesRepository: Repository<CandidateApplicationMessage>,
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
    const records = await this.getWorkflowRecords(applications);
    return {
      items: applications.map((application) =>
        this.toCandidateResponse(
          application,
          histories.get(application.id) ?? [],
          records.offers.get(application.id) ?? null,
          records.messages.get(application.id) ?? [],
        ),
      ),
      total,
      page,
      limit,
    };
  }

  async getForJob(user: AuthenticatedUser, jobId: number) {
    const application = await this.applicationsRepository.findOne({
      where: { userId: user.id, jobId, status: Not("withdrawn") },
      relations: { job: true },
      order: { createdAt: "DESC", id: "DESC" },
    });
    if (!application) return { application: null };
    const histories = await this.getHistories([application]);
    const records = await this.getWorkflowRecords([application]);
    return {
      application: this.toCandidateResponse(
        application,
        histories.get(application.id) ?? [],
        records.offers.get(application.id) ?? null,
        records.messages.get(application.id) ?? [],
      ),
    };
  }

  async listUploadedDocuments(user: AuthenticatedUser, jobId: number) {
    const job = await this.jobsRepository.findOneBy({ id: jobId });
    if (!job) throw new NotFoundException(`Job ${jobId} was not found`);
    const allowedIds = new Set(
      (job.requiredDocuments ?? []).map((document) => document.id),
    );
    const documents = await this.dataSource
      .getRepository(CandidateApplicationDocument)
      .find({
        where: { userId: user.id, jobId, applicationId: IsNull() },
        order: { createdAt: "DESC" },
      });
    const latestByDocument = new Map<string, CandidateApplicationDocument>();
    for (const document of documents) {
      if (allowedIds.has(document.documentId))
        latestByDocument.set(document.documentId, document);
    }
    return [...latestByDocument.values()].map((document) => ({
      documentId: document.documentId,
      label: document.documentLabel,
      fileName: document.fileName,
      uploadedAt: document.createdAt,
    }));
  }

  async uploadDocument(
    user: AuthenticatedUser,
    jobId: number,
    documentId: string,
    file: { buffer: Buffer; originalname: string; contentType: string },
  ) {
    const job = await this.jobsRepository.findOneBy({
      id: jobId,
      isActive: true,
    });
    if (
      !job ||
      (job.applicationDeadline &&
        job.applicationDeadline < currentJobDeadlineDate())
    )
      throw new NotFoundException(`Published job ${jobId} was not found`);
    const configuredDocument = (job.requiredDocuments ?? []).find(
      (document) => document.id === documentId,
    );
    if (!configuredDocument)
      throw new NotFoundException(
        "This document is not requested for the selected job.",
      );
    const extension = file.contentType === "application/pdf" ? "pdf" : "docx";
    const fileName = file.originalname
      .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
      .slice(0, 255);
    const filePath = this.fileStorage.newObjectPath(
      user.id,
      "application",
      extension,
    );
    await this.fileStorage.upload(filePath, file.contentType, file.buffer);
    const documentRepository = this.dataSource.getRepository(
      CandidateApplicationDocument,
    );
    let document: CandidateApplicationDocument;
    try {
      document = await documentRepository.save(
        documentRepository.create({
          userId: user.id,
          jobId,
          applicationId: null,
          documentId,
          documentLabel: configuredDocument.label,
          filePath,
          fileName,
          contentType: file.contentType,
        }),
      );
    } catch (error) {
      try {
        await this.fileStorage.remove(filePath);
      } catch (cleanupError) {
        this.logger.error(
          `Could not remove orphaned application document for candidate ${user.id}: ${
            cleanupError instanceof Error
              ? cleanupError.message
              : "unknown storage error"
          }`,
        );
      }
      throw error;
    }
    await this.auditService.record({
      actorUserId: user.id,
      action: "candidate.application_document_uploaded",
      targetType: "job",
      targetId: jobId,
      details: { documentId, contentType: file.contentType },
    });
    return {
      documentId,
      label: configuredDocument.label,
      fileName: document.fileName,
      uploadedAt: document.createdAt,
    };
  }

  async submit(
    user: AuthenticatedUser,
    jobId: number,
    dto: SubmitCandidateApplicationDto,
  ) {
    const existingApplication = await this.applicationsRepository.findOne({
      where: { userId: user.id, jobId, status: Not("withdrawn") },
      relations: { job: true },
      order: { createdAt: "DESC", id: "DESC" },
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
    if (shareProfile && profile?.profileVisibility === "private") {
      throw new BadRequestException(
        "Change profile visibility to applications or recruiters before sharing profile details with an application.",
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
      const applicationAnswers = collectApplicationAnswers(
        lockedJob.applicationQuestions,
        dto.answers,
      );
      const documentRepository = manager.getRepository(
        CandidateApplicationDocument,
      );
      const pendingDocuments = await documentRepository.find({
        where: {
          userId: user.id,
          jobId,
          applicationId: IsNull(),
        },
        order: { createdAt: "DESC" },
        lock: { mode: "pessimistic_write" },
      });
      const selectedDocuments = new Map<string, CandidateApplicationDocument>();
      for (const document of pendingDocuments) {
        if (
          (lockedJob.requiredDocuments ?? []).some(
            (configured) => configured.id === document.documentId,
          ) &&
          !selectedDocuments.has(document.documentId)
        )
          selectedDocuments.set(document.documentId, document);
      }
      const missingDocuments = (lockedJob.requiredDocuments ?? []).filter(
        (document) => document.required && !selectedDocuments.has(document.id),
      );
      if (missingDocuments.length)
        throw new BadRequestException(
          `Upload the required document(s) before applying: ${missingDocuments.map((document) => document.label).join(", ")}.`,
        );

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
                headline: profile!.headline,
                location: profile!.location,
                summary: profile!.summary,
                skills: this.parseSkills(profile!.skills),
                experience: profile!.experience,
                education: profile!.education,
                certifications: profile!.certifications,
                links: profile!.links,
                ...(profile!.allowRecruiterContact
                  ? {
                      email: account.email,
                      ...(account.phoneVerified && account.phoneE164
                        ? { phone: account.phoneE164 }
                        : {}),
                    }
                  : {}),
              }
            : null,
          applicationAnswers,
        })
        .orIgnore()
        .returning(["id"])
        .execute();
      created = insertResult.identifiers.length > 0;

      const applications = manager.getRepository(CandidateApplication);
      const application = await applications.findOne({
        where: { userId: user.id, jobId, status: Not("withdrawn") },
        order: { createdAt: "DESC", id: "DESC" },
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
        const applicationDocuments = [...selectedDocuments.values()];
        for (const document of applicationDocuments)
          document.applicationId = application.id;
        if (applicationDocuments.length)
          await documentRepository.save(applicationDocuments);
      }
    });

    const application = await this.applicationsRepository.findOne({
      where: { userId: user.id, jobId, status: Not("withdrawn") },
      relations: { job: true },
      order: { createdAt: "DESC", id: "DESC" },
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
      await this.notifyEmployer(application.job, application.id);
    }
    const histories = await this.getHistories([application]);
    const records = await this.getWorkflowRecords([application]);
    return this.toCandidateResponse(
      application,
      histories.get(application.id) ?? [],
      records.offers.get(application.id) ?? null,
      records.messages.get(application.id) ?? [],
    );
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
      if (
        !["submitted", "in_review", "interview", "offer"].includes(
          application.status,
        )
      ) {
        throw new BadRequestException(
          "This application can no longer be withdrawn.",
        );
      }
      const previousStatus = application.status;
      application.status = "withdrawal_requested";
      application.withdrawalRequestedAt = new Date();
      application.withdrawalRequestedFromStatus = previousStatus;
      await applications.save(application);
      await manager.getRepository(CandidateApplicationStatus).save({
        applicationId,
        fromStatus: previousStatus,
        toStatus: "withdrawal_requested",
        note: "Candidate requested withdrawal; employer confirmation is pending.",
        changedByUserId: user.id,
      });
      const recipientIds = application.job.organizationId
        ? (
            await manager.getRepository(EmployerOrganizationMember).find({
              where: {
                organizationId: application.job.organizationId,
                status: "active",
              },
            })
          )
            .map((member) => member.userId)
            .filter((id): id is number => id !== null)
        : application.job.employerUserId
          ? [application.job.employerUserId]
          : [];
      if (recipientIds.length) {
        await manager.getRepository(UserNotification).save(
          [...new Set(recipientIds)].map((userId) =>
            manager.getRepository(UserNotification).create({
              userId,
              type: "withdrawal_requested",
              title: "Candidate requested withdrawal",
              message: `A candidate requested to withdraw from ${application.job.title}.`,
              link: "/#dashboard/applicants",
              readAt: null,
            }),
          ),
        );
      }
    });
    const application = await this.applicationsRepository.findOne({
      where: { id: applicationId, userId: user.id },
      relations: { job: true },
    });
    if (!application) throw new NotFoundException("Application was not found");
    await this.auditService.record({
      actorUserId: user.id,
      action: "candidate.application_withdrawal_requested",
      targetType: "application",
      targetId: application.id,
      details: { jobId: application.jobId },
    });
    const histories = await this.getHistories([application]);
    const records = await this.getWorkflowRecords([application]);
    return this.toCandidateResponse(
      application,
      histories.get(application.id) ?? [],
      records.offers.get(application.id) ?? null,
      records.messages.get(application.id) ?? [],
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
    if (!["in_review", "interview", "rejected"].includes(status)) {
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
        await manager.getRepository(UserNotification).save(
          manager.getRepository(UserNotification).create({
            userId: application.userId,
            type: "application_status",
            title: "Application status updated",
            message: `Your application for ${application.job.title} is now ${status.replace("_", " ")}.`,
            link: "/#dashboard/applications",
            readAt: null,
          }),
        );
        return { application, history };
      },
    );

    let notificationQueued = false;
    let notificationStatus: "queued" | "disabled" | "failed" = "disabled";
    const preferences = await this.profilesRepository.findOneBy({
      userId: application.userId,
    });
    if (preferences?.applicationEmailUpdates ?? true) {
      try {
        await this.emailDelivery.sendNotification(
          application.user.email,
          `Application update: ${application.job.title}`,
          `Your application for ${application.job.title} at ${application.job.company} is now ${status.replace("_", " ")}.`,
          `application-status:${applicationId}:${history.id}`,
        );
        notificationQueued = true;
        notificationStatus = "queued";
      } catch (error) {
        notificationStatus = "failed";
        this.logger.error(
          `Application ${applicationId} status email could not be queued: ${
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
      notificationQueued,
      notificationStatus,
    };
  }

  async respondToOffer(
    user: AuthenticatedUser,
    applicationId: number,
    decision: "accepted" | "declined",
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const application = await manager
        .getRepository(CandidateApplication)
        .createQueryBuilder("application")
        .innerJoinAndSelect("application.job", "job")
        .where("application.id = :applicationId", { applicationId })
        .andWhere("application.userId = :userId", { userId: user.id })
        .setLock("pessimistic_write")
        .getOne();
      if (!application)
        throw new NotFoundException("Application was not found.");
      if (application.status !== "offer")
        throw new BadRequestException(
          "There is no open offer for this application.",
        );
      const offer = await manager
        .getRepository(CandidateApplicationOffer)
        .findOne({
          where: { applicationId },
          lock: { mode: "pessimistic_write" },
        });
      if (!offer || offer.status !== "pending")
        throw new BadRequestException(
          "This offer is no longer awaiting a response.",
        );
      if (offer.expiresAt.getTime() <= Date.now()) {
        offer.status = "expired";
        await manager.getRepository(CandidateApplicationOffer).save(offer);
        return { expired: true as const };
      }
      offer.status = decision;
      offer.respondedAt = new Date();
      await manager.getRepository(CandidateApplicationOffer).save(offer);
      const status =
        decision === "accepted" ? "offer_accepted" : "offer_declined";
      application.status = status;
      await manager.getRepository(CandidateApplication).save(application);
      await manager.getRepository(CandidateApplicationStatus).save({
        applicationId,
        fromStatus: "offer",
        toStatus: status,
        note: `Candidate ${decision} the offer.`,
        changedByUserId: user.id,
      });
      const recipientIds = application.job.organizationId
        ? (
            await manager.getRepository(EmployerOrganizationMember).find({
              where: {
                organizationId: application.job.organizationId,
                status: "active",
              },
            })
          )
            .map((member) => member.userId)
            .filter((id): id is number => id !== null)
        : application.job.employerUserId
          ? [application.job.employerUserId]
          : [];
      if (recipientIds.length) {
        await manager.getRepository(UserNotification).save(
          [...new Set(recipientIds)].map((userId) =>
            manager.getRepository(UserNotification).create({
              userId,
              type: "offer_response",
              title: "Candidate responded to an offer",
              message: `A candidate ${decision} the offer for ${application.job.title}.`,
              link: "/#dashboard/applicants",
              readAt: null,
            }),
          ),
        );
      }
      return { expired: false as const, status };
    });
    if (result.expired)
      throw new BadRequestException(
        "This offer has expired and can no longer be accepted.",
      );
    await this.auditService.record({
      actorUserId: user.id,
      action: `candidate.application_offer_${decision}`,
      targetType: "application",
      targetId: applicationId,
    });
    return { applicationId, status: result.status };
  }

  async listMessages(user: AuthenticatedUser, applicationId: number) {
    const application = await this.applicationsRepository.findOneBy({
      id: applicationId,
      userId: user.id,
    });
    if (!application) throw new NotFoundException("Application was not found.");
    const messages = await this.messagesRepository.find({
      where: { applicationId },
      relations: { sender: true },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return messages.map((message) => ({
      id: message.id,
      message: message.message,
      senderUserId: message.senderUserId,
      senderName: message.sender.displayName,
      createdAt: message.createdAt,
    }));
  }

  async sendMessage(
    user: AuthenticatedUser,
    applicationId: number,
    dto: CreateCandidateApplicationMessageDto,
  ) {
    const messageText = dto.message.trim();
    if (!messageText) {
      throw new BadRequestException("Write a message before sending it.");
    }
    const application = await this.applicationsRepository.findOne({
      where: { id: applicationId, userId: user.id },
      relations: { job: true },
    });
    if (!application) throw new NotFoundException("Application was not found.");
    const message = await this.messagesRepository.save(
      this.messagesRepository.create({
        applicationId,
        senderUserId: user.id,
        message: messageText,
      }),
    );
    const recipientIds = application.job.organizationId
      ? (
          await this.organizationMembers.find({
            where: {
              organizationId: application.job.organizationId,
              status: "active",
            },
          })
        )
          .map((member) => member.userId)
          .filter((id): id is number => id !== null && id !== user.id)
      : application.job.employerUserId &&
          application.job.employerUserId !== user.id
        ? [application.job.employerUserId]
        : [];
    if (recipientIds.length) {
      await this.notificationsRepository.save(
        [...new Set(recipientIds)].map((userId) =>
          this.notificationsRepository.create({
            userId,
            type: "application_message",
            title: "New candidate message",
            message: `A candidate sent a message about ${application.job.title}.`,
            link: "/#dashboard/applicants",
            readAt: null,
          }),
        ),
      );
    }
    await this.auditService.record({
      actorUserId: user.id,
      action: "candidate.application_message_sent",
      targetType: "application",
      targetId: applicationId,
      details: { jobId: application.jobId },
    });
    return {
      id: message.id,
      message: message.message,
      senderUserId: user.id,
      senderName: user.displayName,
      createdAt: message.createdAt,
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

  private async getWorkflowRecords(applications: CandidateApplication[]) {
    const ids = applications.map((application) => application.id);
    if (!ids.length) {
      return {
        offers: new Map<number, CandidateApplicationOffer>(),
        messages: new Map<number, CandidateApplicationMessage[]>(),
      };
    }
    const [offers, messages] = await Promise.all([
      this.offersRepository.find({
        where: ids.map((applicationId) => ({ applicationId })),
      }),
      this.messagesRepository.find({
        where: ids.map((applicationId) => ({ applicationId })),
        relations: { sender: true },
        order: { createdAt: "ASC", id: "ASC" },
      }),
    ]);
    const offerByApplication = new Map(
      offers.map((offer) => [offer.applicationId, offer]),
    );
    const messagesByApplication = new Map<
      number,
      CandidateApplicationMessage[]
    >();
    for (const message of messages) {
      const items = messagesByApplication.get(message.applicationId) ?? [];
      items.push(message);
      messagesByApplication.set(message.applicationId, items);
    }
    return { offers: offerByApplication, messages: messagesByApplication };
  }

  private toCandidateResponse(
    application: CandidateApplication,
    histories: CandidateApplicationStatus[],
    offer: CandidateApplicationOffer | null = null,
    messages: CandidateApplicationMessage[] = [],
  ) {
    const { job } = application;
    const offerExpired =
      application.status === "offer" &&
      (offer?.status === "expired" ||
        (offer?.status === "pending" &&
          offer.expiresAt.getTime() <= Date.now()));
    return {
      id: application.id,
      jobId: application.jobId,
      status: offerExpired ? "offer_expired" : application.status,
      coverLetter: application.coverLetter,
      applicationAnswers: application.applicationAnswers ?? [],
      profileShared: application.profileShared,
      resumeIncluded: Boolean(application.resumePath),
      resumeFileName: application.resumeFileName,
      withdrawnAt: application.withdrawnAt,
      withdrawalRequestedAt: application.withdrawalRequestedAt,
      createdAt: application.createdAt,
      offer: offer
        ? {
            termsSummary: offer.termsSummary,
            expiresAt: offer.expiresAt,
            status:
              offer.status === "expired" ||
              (offer.status === "pending" &&
                offer.expiresAt.getTime() <= Date.now())
                ? "expired"
                : offer.status,
            respondedAt: offer.respondedAt,
          }
        : null,
      messages: messages.map((message) => ({
        id: message.id,
        message: message.message,
        senderUserId: message.senderUserId,
        senderName: message.sender.displayName,
        createdAt: message.createdAt,
      })),
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

  private async notifyEmployer(job: Job, applicationId: number) {
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
            `application-received:${applicationId}:${recipient.id}`,
          ),
        ),
      );
      const failures = emails.filter(
        (result) => result.status === "rejected",
      ).length;
      if (failures) {
        this.logger.error(
          `${failures} employer application notification email(s) could not be queued for job ${job.id}.`,
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
