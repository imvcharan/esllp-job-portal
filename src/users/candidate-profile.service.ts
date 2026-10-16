import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { User } from './user.entity';
import { CandidateProfile } from './candidate-profile.entity';
import { UpdateCandidateProfileDto } from './dto/update-candidate-profile.dto';

@Injectable()
export class CandidateProfileService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(CandidateProfile)
    private readonly profilesRepository: Repository<CandidateProfile>,
  ) {}

  async get(user: AuthenticatedUser) {
    const [account, profile] = await Promise.all([
      this.usersRepository.findOneBy({ id: user.id, isActive: true }),
      this.profilesRepository.findOneBy({ userId: user.id }),
    ]);
    if (!account) {
      throw new NotFoundException('Candidate account was not found');
    }

    return {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      headline: profile?.headline ?? '',
      location: profile?.location ?? '',
      phone: profile?.phone ?? '',
      summary: profile?.summary ?? '',
      skills: this.parseSkills(profile?.skills),
      updatedAt: profile?.updatedAt ?? null,
    };
  }

  async update(user: AuthenticatedUser, dto: UpdateCandidateProfileDto) {
    await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const profiles = manager.getRepository(CandidateProfile);
      const account = await users.findOneBy({ id: user.id, isActive: true });
      if (!account) {
        throw new NotFoundException('Candidate account was not found');
      }

      account.displayName = dto.displayName.trim();
      await users.save(account);
      await profiles.save(
        profiles.create({
          userId: user.id,
          headline: dto.headline?.trim() ?? '',
          location: dto.location?.trim() ?? '',
          phone: dto.phone?.trim() ?? '',
          summary: dto.summary?.trim() ?? '',
          skills: JSON.stringify(
            (dto.skills ?? [])
              .map((skill) => skill.trim())
              .filter(Boolean)
              .filter((skill, index, all) =>
                all.findIndex(
                  (candidate) =>
                    candidate.toLocaleLowerCase() ===
                    skill.toLocaleLowerCase(),
                ) === index,
              ),
          ),
        }),
      );
    });

    return this.get(user);
  }

  private parseSkills(value: string | undefined): string[] {
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.some((skill) => typeof skill !== 'string')
    ) {
      throw new Error('Stored candidate skills have an invalid format');
    }
    return parsed;
  }
}
