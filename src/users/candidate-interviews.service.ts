import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthenticatedUser } from "../auth/auth.types";
import { EmployerInterview } from "../employers/employer-interview.entity";
import { UserNotification } from "../employers/user-notification.entity";
import { CandidateInterviewResponseDto } from "./dto/candidate-interview-response.dto";

@Injectable()
export class CandidateInterviewsService {
  constructor(
    @InjectRepository(EmployerInterview)
    private readonly interviews: Repository<EmployerInterview>,
    @InjectRepository(UserNotification)
    private readonly notifications: Repository<UserNotification>,
  ) {}

  async listForCandidate(user: AuthenticatedUser) {
    const items = await this.interviews
      .createQueryBuilder("interview")
      .innerJoinAndSelect("interview.application", "application")
      .innerJoinAndSelect("application.job", "job")
      .where("application.userId = :userId", { userId: user.id })
      .orderBy("interview.startsAt", "ASC")
      .addOrderBy("interview.id", "ASC")
      .getMany();
    return {
      items: items.map((interview) => ({
        id: interview.id,
        startsAt: interview.startsAt,
        durationMinutes: interview.durationMinutes,
        location: interview.location,
        meetingUrl: interview.meetingUrl,
        status: interview.status,
        candidateResponse: interview.candidateResponse,
        candidateResponseNote: interview.candidateResponseNote,
        createdAt: interview.createdAt,
        job: {
          id: interview.application.job.id,
          title: interview.application.job.title,
          company: interview.application.job.company,
        },
      })),
    };
  }

  async respond(
    user: AuthenticatedUser,
    interviewId: number,
    dto: CandidateInterviewResponseDto,
  ) {
    return this.interviews.manager.transaction(async (manager) => {
      const interview = await manager
        .getRepository(EmployerInterview)
        .createQueryBuilder("interview")
        .innerJoinAndSelect("interview.application", "application")
        .innerJoinAndSelect("application.job", "job")
        .where("interview.id = :interviewId", { interviewId })
        .andWhere("application.userId = :userId", { userId: user.id })
        .setLock("pessimistic_write", undefined, ["interview"])
        .getOne();
      if (!interview) throw new NotFoundException("Interview was not found.");
      if (interview.status !== "scheduled")
        throw new ConflictException("This interview is no longer scheduled.");
      if (interview.startsAt <= new Date())
        throw new BadRequestException(
          "This interview time has already passed.",
        );
      if (interview.candidateResponse !== "pending") {
        if (interview.candidateResponse === dto.response)
          return { success: true, response: interview.candidateResponse };
        throw new ConflictException(
          "You have already responded to this interview invitation.",
        );
      }

      interview.candidateResponse = dto.response;
      interview.candidateResponseNote = dto.note?.trim() || null;
      interview.candidateResponseAt = new Date();
      await manager.getRepository(EmployerInterview).save(interview);
      await manager.getRepository(UserNotification).save(
        manager.getRepository(UserNotification).create({
          userId: interview.scheduledByUserId,
          type: "interview_candidate_response",
          title: "Candidate responded to interview",
          message: `${user.displayName || user.email} ${dto.response.replace(/_/g, " ")} the interview for ${interview.application.job.title}.${interview.candidateResponseNote ? ` Note: ${interview.candidateResponseNote}` : ""}`,
          link: "/#dashboard/interviews",
          readAt: null,
        }),
      );
      return { success: true, response: interview.candidateResponse };
    });
  }
}
