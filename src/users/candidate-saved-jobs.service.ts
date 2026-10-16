import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { Job } from '../jobs/job.entity';
import { CandidateSavedJob } from './candidate-saved-job.entity';

@Injectable()
export class CandidateSavedJobsService {
  constructor(
    @InjectRepository(CandidateSavedJob)
    private readonly savedJobsRepository: Repository<CandidateSavedJob>,
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
  ) {}

  async list(user: AuthenticatedUser) {
    const savedJobs = await this.savedJobsRepository
      .createQueryBuilder('saved')
      .innerJoinAndSelect('saved.job', 'job')
      .where('saved.userId = :userId', { userId: user.id })
      .orderBy('saved.createdAt', 'DESC')
      .getMany();

    return savedJobs.map(({ job, createdAt }) => ({
      ...job,
      savedAt: createdAt,
    }));
  }

  async add(user: AuthenticatedUser, jobId: number) {
    const job = await this.jobsRepository.findOneBy({
      id: jobId,
      isActive: true,
    });
    if (!job) {
      throw new NotFoundException(`Published job ${jobId} was not found`);
    }

    await this.savedJobsRepository
      .createQueryBuilder()
      .insert()
      .into(CandidateSavedJob)
      .values({ userId: user.id, jobId })
      .orIgnore()
      .execute();

    return { success: true };
  }

  async remove(user: AuthenticatedUser, jobId: number) {
    await this.savedJobsRepository.delete({ userId: user.id, jobId });
    return { success: true };
  }
}
