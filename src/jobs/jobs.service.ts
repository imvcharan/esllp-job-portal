import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Job } from './job.entity';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    private readonly auditService: AuditService,
  ) {}

  findAll(filters: { query?: string; location?: string }): Promise<Job[]> {
    const queryBuilder = this.jobsRepository
      .createQueryBuilder('job')
      .where('job.isActive = :isActive', { isActive: true })
      .orderBy('job.createdAt', 'DESC');

    const query = filters.query?.trim();
    if (query) {
      queryBuilder.andWhere(
        new Brackets((where) => {
          where
            .where('job.title LIKE :query', { query: `%${query}%` })
            .orWhere('job.company LIKE :query', { query: `%${query}%` })
            .orWhere('job.description LIKE :query', { query: `%${query}%` });
        }),
      );
    }

    const location = filters.location?.trim();
    if (location) {
      queryBuilder.andWhere('job.location LIKE :location', {
        location: `%${location}%`,
      });
    }

    return queryBuilder.getMany();
  }

  findAllForAdministration(): Promise<Job[]> {
    return this.jobsRepository.find({ order: { createdAt: 'DESC' } });
  }

  async create(
    dto: CreateJobDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<Job> {
    const salaryMin = dto.salaryMin ?? null;
    const salaryMax = dto.salaryMax ?? null;
    if (
      salaryMin !== null &&
      salaryMax !== null &&
      salaryMin > salaryMax
    ) {
      throw new BadRequestException(
        'Minimum salary cannot exceed maximum salary',
      );
    }
    const job = await this.jobsRepository.save(
      this.jobsRepository.create({
        ...dto,
        title: dto.title.trim(),
        company: dto.company.trim(),
        location: dto.location.trim(),
        workplaceType: dto.workplaceType ?? 'onsite',
        employmentType: dto.employmentType ?? 'full-time',
        salaryMin,
        salaryMax,
        experience: dto.experience?.trim() || null,
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? false,
      }),
    );
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'job.created',
      targetType: 'job',
      targetId: job.id,
      details: { title: job.title, isActive: job.isActive },
      ipAddress,
    });
    return job;
  }

  async update(
    id: number,
    dto: UpdateJobDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<Job | null> {
    const job = await this.jobsRepository.findOneBy({ id });
    if (!job) {
      return null;
    }
    const salaryMin = dto.salaryMin === undefined ? job.salaryMin : dto.salaryMin;
    const salaryMax = dto.salaryMax === undefined ? job.salaryMax : dto.salaryMax;
    if (
      salaryMin !== null &&
      salaryMax !== null &&
      salaryMin > salaryMax
    ) {
      throw new BadRequestException(
        'Minimum salary cannot exceed maximum salary',
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
      action: 'job.updated',
      targetType: 'job',
      targetId: saved.id,
      details: { title: saved.title, isActive: saved.isActive },
      ipAddress,
    });
    return saved;
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
      action: 'job.archived',
      targetType: 'job',
      targetId: archived.id,
      details: { title: archived.title },
      ipAddress,
    });
    return archived;
  }

  findOne(id: number): Promise<Job | null> {
    return this.jobsRepository.findOneBy({ id, isActive: true });
  }
}
