import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { Job } from '../jobs/job.entity';
import { CandidateApplication } from './candidate-application.entity';
import { SubmitCandidateApplicationDto } from './dto/submit-candidate-application.dto';

@Injectable()
export class CandidateApplicationsService {
  constructor(
    @InjectRepository(CandidateApplication)
    private readonly applicationsRepository: Repository<CandidateApplication>,
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
  ) {}

  async list(user: AuthenticatedUser) {
    const applications = await this.applicationsRepository
      .createQueryBuilder('application')
      .innerJoinAndSelect('application.job', 'job')
      .where('application.userId = :userId', { userId: user.id })
      .orderBy('application.createdAt', 'DESC')
      .getMany();

    return applications.map((application) =>
      this.toResponse(application),
    );
  }

  async getForJob(user: AuthenticatedUser, jobId: number) {
    const application = await this.applicationsRepository.findOne({
      where: { userId: user.id, jobId },
      relations: { job: true },
    });
    return {
      application: application ? this.toResponse(application) : null,
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
      return this.toResponse(existingApplication);
    }

    const job = await this.jobsRepository.findOneBy({
      id: jobId,
      isActive: true,
    });
    if (!job) {
      throw new NotFoundException(`Published job ${jobId} was not found`);
    }

    await this.applicationsRepository
      .createQueryBuilder()
      .insert()
      .into(CandidateApplication)
      .values({
        userId: user.id,
        jobId,
        coverLetter: dto.coverLetter?.trim() || null,
      })
      .orIgnore()
      .execute();

    const application = await this.applicationsRepository.findOne({
      where: { userId: user.id, jobId },
      relations: { job: true },
    });
    if (!application) {
      throw new Error('Submitted application could not be loaded');
    }
    return this.toResponse(application);
  }

  private toResponse(application: CandidateApplication) {
    const { job } = application;
    return {
      id: application.id,
      jobId: application.jobId,
      status: application.status,
      coverLetter: application.coverLetter,
      createdAt: application.createdAt,
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
        isActive: job.isActive,
      },
    };
  }
}
