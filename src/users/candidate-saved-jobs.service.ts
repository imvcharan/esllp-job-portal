import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { Job } from '../jobs/job.entity';
import { CandidateSavedJob } from './candidate-saved-job.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CandidateSavedJobsService {
  constructor(
    @InjectRepository(CandidateSavedJob)
    private readonly savedJobsRepository: Repository<CandidateSavedJob>,
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    private readonly auditService: AuditService,
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

    const result = await this.savedJobsRepository
      .createQueryBuilder()
      .insert()
      .into(CandidateSavedJob)
      .values({ userId: user.id, jobId })
      .orIgnore()
      .execute();

    if (result.identifiers.length) {
      await this.auditService.record({
        actorUserId: user.id,
        action: 'candidate.job_saved',
        targetType: 'job',
        targetId: jobId,
        details: { title: job.title },
      });
    }
    return { success: true };
  }

  async remove(user: AuthenticatedUser, jobId: number) {
    const result = await this.savedJobsRepository.delete({
      userId: user.id,
      jobId,
    });
    if (result.affected) {
      await this.auditService.record({
        actorUserId: user.id,
        action: 'candidate.job_unsaved',
        targetType: 'job',
        targetId: jobId,
      });
    }
    return { success: true };
  }
}
