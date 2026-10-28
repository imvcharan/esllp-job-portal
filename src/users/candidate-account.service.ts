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
import { UserNotification } from "../employers/user-notification.entity";
import { CandidateApplication } from "./candidate-application.entity";
import { CandidateApplicationStatus } from "./candidate-application-status.entity";
import { CandidateApplicationOffer } from "./candidate-application-offer.entity";
import { CandidateApplicationMessage } from "./candidate-application-message.entity";
import {
  CandidateDeletionRequest,
  CandidateDeletionRequestStatus,
} from "./candidate-deletion-request.entity";
import { CandidateProfile } from "./candidate-profile.entity";
import { CandidateSavedJob } from "./candidate-saved-job.entity";
import { CandidateSavedSearch } from "./candidate-saved-search.entity";
import { CreateCandidateDeletionRequestDto } from "./dto/create-candidate-deletion-request.dto";
import { UpdateCandidateDeletionRequestDto } from "./dto/update-candidate-deletion-request.dto";
import { User, UserRole } from "./user.entity";

@Injectable()
export class CandidateAccountService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(CandidateProfile)
    private readonly profilesRepository: Repository<CandidateProfile>,
    @InjectRepository(CandidateApplication)
    private readonly applicationsRepository: Repository<CandidateApplication>,
    @InjectRepository(CandidateApplicationStatus)
    private readonly applicationStatusesRepository: Repository<CandidateApplicationStatus>,
    @InjectRepository(CandidateApplicationOffer)
    private readonly offersRepository: Repository<CandidateApplicationOffer>,
    @InjectRepository(CandidateApplicationMessage)
    private readonly messagesRepository: Repository<CandidateApplicationMessage>,
    @InjectRepository(CandidateSavedJob)
    private readonly savedJobsRepository: Repository<CandidateSavedJob>,
    @InjectRepository(CandidateSavedSearch)
    private readonly savedSearchesRepository: Repository<CandidateSavedSearch>,
    @InjectRepository(UserNotification)
    private readonly notificationsRepository: Repository<UserNotification>,
    @InjectRepository(CandidateDeletionRequest)
    private readonly deletionRequestsRepository: Repository<CandidateDeletionRequest>,
    private readonly auditService: AuditService,
  ) {}

  async exportCandidateData(user: AuthenticatedUser) {
    const account = await this.usersRepository.findOne({
      where: { id: user.id, role: UserRole.CANDIDATE },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!account)
      throw new NotFoundException("Candidate account was not found.");

    const [
      profile,
      applications,
      savedJobs,
      savedSearches,
      notifications,
      deletionRequests,
    ] = await Promise.all([
      this.profilesRepository.findOneBy({ userId: user.id }),
      this.applicationsRepository.find({
        where: { userId: user.id },
        relations: { job: true },
        order: { createdAt: "ASC" },
      }),
      this.savedJobsRepository.find({
        where: { userId: user.id },
        relations: { job: true },
        order: { createdAt: "ASC" },
      }),
      this.savedSearchesRepository.find({
        where: { userId: user.id },
        order: { createdAt: "ASC" },
      }),
      this.notificationsRepository.find({
        where: { userId: user.id },
        order: { createdAt: "ASC" },
      }),
      this.deletionRequestsRepository.find({
        where: { requesterUserId: user.id },
        order: { createdAt: "ASC" },
      }),
    ]);
    const applicationIds = applications.map(({ id }) => id);
    const history = applicationIds.length
      ? await this.applicationStatusesRepository.find({
          where: { applicationId: In(applicationIds) },
          order: { createdAt: "ASC" },
        })
      : [];
    const historyByApplication = new Map<
      number,
      CandidateApplicationStatus[]
    >();
    for (const entry of history) {
      const entries = historyByApplication.get(entry.applicationId) ?? [];
      entries.push(entry);
      historyByApplication.set(entry.applicationId, entries);
    }
    const [offers, messages] = applicationIds.length
      ? await Promise.all([
          this.offersRepository.find({
            where: { applicationId: In(applicationIds) },
          }),
          this.messagesRepository.find({
            where: { applicationId: In(applicationIds) },
            relations: { sender: true },
            order: { createdAt: "ASC", id: "ASC" },
          }),
        ])
      : [[], []];
    const offerByApplication = new Map(
      offers.map((offer) => [offer.applicationId, offer]),
    );

    return {
      exportedAt: new Date().toISOString(),
      account,
      profile: profile
        ? {
            headline: profile.headline,
            location: profile.location,
            phone: profile.phone,
            summary: profile.summary,
            skills: profile.skills,
            desiredJobTitles: profile.desiredJobTitles,
            employmentTypes: profile.employmentTypes,
            workplaceTypes: profile.workplaceTypes,
            experience: profile.experience,
            education: profile.education,
            links: profile.links,
            hasPhoto: Boolean(profile.photoPath),
            hasResume: Boolean(profile.resumePath),
            resumeFileName: profile.resumeFileName,
            shareProfileOnApplication: profile.shareProfileOnApplication,
            applicationEmailUpdates: profile.applicationEmailUpdates,
            jobAlertEmails: profile.jobAlertEmails,
            updatedAt: profile.updatedAt,
          }
        : null,
      applications: applications.map((application) => {
        const offer = offerByApplication.get(application.id) ?? null;
        const offerExpired =
          application.status === "offer" &&
          (offer?.status === "expired" ||
            (offer?.status === "pending" &&
              offer.expiresAt.getTime() <= Date.now()));
        return {
          id: application.id,
          status: offerExpired ? "offer_expired" : application.status,
          coverLetter: application.coverLetter,
          profileShared: application.profileShared,
          profileSnapshot: application.profileSnapshot,
          hasResume: Boolean(application.resumePath),
          resumeFileName: application.resumeFileName,
          withdrawnAt: application.withdrawnAt,
          withdrawalRequestedAt: application.withdrawalRequestedAt,
          createdAt: application.createdAt,
          updatedAt: application.updatedAt,
          job: {
            id: application.job.id,
            title: application.job.title,
            company: application.job.company,
            location: application.job.location,
          },
          statusHistory: historyByApplication.get(application.id) ?? [],
          offer: offer
            ? {
                ...offer,
                status:
                  offer.status === "pending" &&
                  offer.expiresAt.getTime() <= Date.now()
                    ? "expired"
                    : offer.status,
              }
            : null,
          messages: messages
            .filter((message) => message.applicationId === application.id)
            .map((message) => ({
              message: message.message,
              senderName: message.sender.displayName,
              createdAt: message.createdAt,
            })),
        };
      }),
      savedJobs: savedJobs.map(({ job, createdAt }) => ({
        jobId: job.id,
        title: job.title,
        company: job.company,
        savedAt: createdAt,
      })),
      savedSearches,
      notifications,
      deletionRequests,
    };
  }

  async getDeletionRequest(user: AuthenticatedUser) {
    return (
      (await this.deletionRequestsRepository.findOne({
        where: { requesterUserId: user.id },
        order: { createdAt: "DESC" },
      })) ?? null
    );
  }

  async requestDeletion(
    user: AuthenticatedUser,
    dto: CreateCandidateDeletionRequestDto,
  ) {
    const existing = await this.deletionRequestsRepository.findOne({
      where: {
        requesterUserId: user.id,
        status: In([
          CandidateDeletionRequestStatus.OPEN,
          CandidateDeletionRequestStatus.REVIEWING,
        ]),
      },
      order: { createdAt: "DESC" },
    });
    if (existing) return { id: existing.id, status: existing.status };
    let request: CandidateDeletionRequest;
    try {
      request = await this.deletionRequestsRepository.save(
        this.deletionRequestsRepository.create({
          requesterUserId: user.id,
          status: CandidateDeletionRequestStatus.OPEN,
          details: dto.details?.trim() || null,
          reviewNote: null,
          reviewedByUserId: null,
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
        const concurrentRequest = await this.getDeletionRequest(user);
        if (concurrentRequest) {
          return {
            id: concurrentRequest.id,
            status: concurrentRequest.status,
          };
        }
        throw new ConflictException(
          "An account deletion request already exists.",
        );
      }
      throw error;
    }
    await this.auditService.record({
      actorUserId: user.id,
      action: "candidate.deletion_requested",
      targetType: "candidate_deletion_request",
      targetId: request.id,
    });
    return { id: request.id, status: request.status };
  }

  async listDeletionRequests(page = 1, limit = 25) {
    const safePage = Math.min(1_000_000, Math.max(1, page));
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [items, total] = await this.deletionRequestsRepository.findAndCount({
      order: { createdAt: "ASC", id: "ASC" },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    const userIds = [
      ...new Set(
        items
          .map((item) => item.requesterUserId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const users = userIds.length
      ? await this.usersRepository.find({
          select: { id: true, displayName: true, email: true },
          where: userIds.map((id) => ({ id })),
        })
      : [];
    const usersById = new Map(users.map((item) => [item.id, item]));
    return {
      items: items.map((item) => ({
        ...item,
        requester: item.requesterUserId
          ? (usersById.get(item.requesterUserId) ?? null)
          : null,
      })),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async reviewDeletionRequest(
    id: number,
    dto: UpdateCandidateDeletionRequestDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const request = await this.deletionRequestsRepository.findOneBy({ id });
    if (!request) throw new NotFoundException("Privacy request was not found.");
    if (request.status === CandidateDeletionRequestStatus.DEFERRED) {
      throw new BadRequestException(
        "A deferred privacy request cannot be changed.",
      );
    }
    if (
      dto.status === CandidateDeletionRequestStatus.DEFERRED &&
      !dto.reviewNote?.trim()
    ) {
      throw new BadRequestException(
        "Add a note explaining why this deletion request is deferred.",
      );
    }
    request.status = dto.status;
    request.reviewNote = dto.reviewNote?.trim() || null;
    request.reviewedByUserId = actor.id;
    const updated = await this.deletionRequestsRepository.save(request);
    await this.auditService.record({
      actorUserId: actor.id,
      action: `candidate.deletion_request.${updated.status}`,
      targetType: "candidate_deletion_request",
      targetId: updated.id,
      details: { requesterUserId: updated.requesterUserId },
      ipAddress,
    });
    return updated;
  }
}
