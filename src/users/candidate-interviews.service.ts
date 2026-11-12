import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthenticatedUser } from "../auth/auth.types";
import { EmployerInterview } from "../employers/employer-interview.entity";

@Injectable()
export class CandidateInterviewsService {
  constructor(
    @InjectRepository(EmployerInterview)
    private readonly interviews: Repository<EmployerInterview>,
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
        createdAt: interview.createdAt,
        job: {
          id: interview.application.job.id,
          title: interview.application.job.title,
          company: interview.application.job.company,
        },
      })),
    };
  }
}
