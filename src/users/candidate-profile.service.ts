import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { AuthenticatedUser } from "../auth/auth.types";
import { User } from "./user.entity";
import { CandidateProfile } from "./candidate-profile.entity";
import { CandidateFileStorageService } from "./candidate-file-storage.service";
import { CandidateApplication } from "./candidate-application.entity";
import {
  CandidateEducationDto,
  CandidateExperienceDto,
  UpdateCandidateProfileDto,
} from "./dto/update-candidate-profile.dto";

@Injectable()
export class CandidateProfileService {
  private readonly logger = new Logger(CandidateProfileService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly fileStorage: CandidateFileStorageService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(CandidateProfile)
    private readonly profilesRepository: Repository<CandidateProfile>,
    @InjectRepository(CandidateApplication)
    private readonly applicationsRepository: Repository<CandidateApplication>,
  ) {}

  async get(user: AuthenticatedUser) {
    const [account, profile] = await Promise.all([
      this.usersRepository.findOneBy({ id: user.id, isActive: true }),
      this.profilesRepository.findOneBy({ userId: user.id }),
    ]);
    if (!account) {
      throw new NotFoundException("Candidate account was not found");
    }

    const [photoUrl, resumeUrl] = await Promise.all([
      profile?.photoPath
        ? this.fileStorage.createSignedUrl(profile.photoPath)
        : null,
      profile?.resumePath
        ? this.fileStorage.createSignedUrl(profile.resumePath)
        : null,
    ]);

    return {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      headline: profile?.headline ?? "",
      location: profile?.location ?? "",
      phone: profile?.phone ?? "",
      summary: profile?.summary ?? "",
      skills: this.parseSkills(profile?.skills),
      desiredJobTitles: profile?.desiredJobTitles ?? [],
      employmentTypes: profile?.employmentTypes ?? [],
      workplaceTypes: profile?.workplaceTypes ?? [],
      experience: profile?.experience ?? [],
      education: profile?.education ?? [],
      links: {
        linkedin: profile?.links?.linkedin ?? "",
        portfolio: profile?.links?.portfolio ?? "",
        github: profile?.links?.github ?? "",
      },
      photoUrl,
      hasPhoto: Boolean(profile?.photoPath),
      resumeUrl,
      resumeFileName: profile?.resumeFileName ?? null,
      shareProfileOnApplication: profile?.shareProfileOnApplication ?? false,
      applicationEmailUpdates: profile?.applicationEmailUpdates ?? true,
      jobAlertEmails: profile?.jobAlertEmails ?? false,
      updatedAt: profile?.updatedAt ?? null,
    };
  }

  async update(user: AuthenticatedUser, dto: UpdateCandidateProfileDto) {
    this.validateCareerDates(dto.experience, dto.education);
    await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const profiles = manager.getRepository(CandidateProfile);
      const account = await users.findOneBy({ id: user.id, isActive: true });
      if (!account) {
        throw new NotFoundException("Candidate account was not found");
      }

      account.displayName = dto.displayName.trim();
      await users.save(account);

      const profile =
        (await profiles.findOneBy({ userId: user.id })) ??
        profiles.create({
          userId: user.id,
          headline: "",
          location: "",
          phone: "",
          summary: "",
          skills: "[]",
          desiredJobTitles: [],
          employmentTypes: [],
          workplaceTypes: [],
          experience: [],
          education: [],
          links: { linkedin: "", portfolio: "", github: "" },
          shareProfileOnApplication: false,
          applicationEmailUpdates: true,
          jobAlertEmails: false,
        });
      if (dto.headline !== undefined) profile.headline = dto.headline.trim();
      if (dto.location !== undefined) profile.location = dto.location.trim();
      if (dto.phone !== undefined) profile.phone = dto.phone.trim();
      if (dto.summary !== undefined) profile.summary = dto.summary.trim();
      if (dto.skills !== undefined)
        profile.skills = JSON.stringify(this.uniqueValues(dto.skills));
      if (dto.desiredJobTitles !== undefined)
        profile.desiredJobTitles = this.uniqueValues(dto.desiredJobTitles);
      if (dto.employmentTypes !== undefined)
        profile.employmentTypes = [...new Set(dto.employmentTypes)];
      if (dto.workplaceTypes !== undefined)
        profile.workplaceTypes = [...new Set(dto.workplaceTypes)];
      if (dto.experience !== undefined)
        profile.experience = dto.experience.map((item) => ({
          title: item.title.trim(),
          company: item.company.trim(),
          location: item.location?.trim() ?? "",
          startDate: item.startDate,
          endDate: item.current ? "" : (item.endDate?.trim() ?? ""),
          current: item.current,
          description: item.description?.trim() ?? "",
        }));
      if (dto.education !== undefined)
        profile.education = dto.education.map((item) => ({
          institution: item.institution.trim(),
          qualification: item.qualification.trim(),
          fieldOfStudy: item.fieldOfStudy?.trim() ?? "",
          startDate: item.startDate,
          endDate: item.endDate?.trim() ?? "",
          description: item.description?.trim() ?? "",
        }));
      if (dto.links) {
        profile.links = {
          linkedin: dto.links.linkedin?.trim() ?? profile.links.linkedin ?? "",
          portfolio:
            dto.links.portfolio?.trim() ?? profile.links.portfolio ?? "",
          github: dto.links.github?.trim() ?? profile.links.github ?? "",
        };
      }
      profile.shareProfileOnApplication =
        dto.shareProfileOnApplication ?? profile.shareProfileOnApplication;
      profile.applicationEmailUpdates =
        dto.applicationEmailUpdates ?? profile.applicationEmailUpdates;
      profile.jobAlertEmails = dto.jobAlertEmails ?? profile.jobAlertEmails;
      await profiles.save(profile);
    });

    return this.get(user);
  }

  async uploadPhoto(user: AuthenticatedUser, image: Uint8Array) {
    const profile = await this.getOrCreateProfile(user);
    const path = this.fileStorage.newObjectPath(user.id, "photo", "webp");
    await this.fileStorage.upload(path, "image/webp", image);
    const previousPath = profile.photoPath;
    profile.photoPath = path;
    try {
      await this.profilesRepository.save(profile);
    } catch (error) {
      await this.cleanupFailedUpload(path, error);
      throw error;
    }
    const storageCleanupWarning = previousPath
      ? await this.removeOldObject(previousPath, "previous profile photo")
      : null;
    return this.withCleanupWarning(await this.get(user), storageCleanupWarning);
  }

  async removePhoto(user: AuthenticatedUser) {
    const profile = await this.getOrCreateProfile(user);
    const previousPath = profile.photoPath;
    profile.photoPath = null;
    await this.profilesRepository.save(profile);
    const storageCleanupWarning = previousPath
      ? await this.removeOldObject(previousPath, "profile photo")
      : null;
    return this.withCleanupWarning(await this.get(user), storageCleanupWarning);
  }

  async uploadResume(
    user: AuthenticatedUser,
    file: Uint8Array,
    originalName: string,
  ) {
    const profile = await this.getOrCreateProfile(user);
    const safeFileName = originalName
      .replace(/[\/\\\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(-180);
    const path = this.fileStorage.newObjectPath(user.id, "resume", "pdf");
    await this.fileStorage.upload(path, "application/pdf", file);
    const previousPath = profile.resumePath;
    profile.resumePath = path;
    profile.resumeFileName = safeFileName || "resume.pdf";
    try {
      await this.profilesRepository.save(profile);
    } catch (error) {
      await this.cleanupFailedUpload(path, error);
      throw error;
    }
    const storageCleanupWarning = previousPath
      ? await this.removeOldResumeIfUnattached(previousPath)
      : null;
    return this.withCleanupWarning(await this.get(user), storageCleanupWarning);
  }

  async removeResume(user: AuthenticatedUser) {
    const profile = await this.getOrCreateProfile(user);
    const previousPath = profile.resumePath;
    profile.resumePath = null;
    profile.resumeFileName = null;
    await this.profilesRepository.save(profile);
    const storageCleanupWarning = previousPath
      ? await this.removeOldResumeIfUnattached(previousPath)
      : null;
    return this.withCleanupWarning(await this.get(user), storageCleanupWarning);
  }

  private async cleanupFailedUpload(path: string, saveError: unknown) {
    try {
      await this.fileStorage.remove(path);
    } catch (cleanupError) {
      this.logger.error(
        `Profile database save failed and uploaded object ${path} could not be cleaned up: ${
          cleanupError instanceof Error
            ? cleanupError.message
            : "unknown storage cleanup error"
        }; original error: ${
          saveError instanceof Error
            ? saveError.message
            : "unknown database error"
        }`,
      );
    }
  }

  private async removeOldObject(
    path: string,
    description: string,
  ): Promise<string | null> {
    try {
      await this.fileStorage.remove(path);
      return null;
    } catch (error) {
      this.logger.error(
        `Candidate ${description} ${path} could not be removed: ${
          error instanceof Error ? error.message : "unknown storage error"
        }`,
      );
      return `Your profile was updated, but the ${description} could not be removed from private storage. Contact support if you need it deleted.`;
    }
  }

  private async removeOldResumeIfUnattached(
    path: string,
  ): Promise<string | null> {
    try {
      if (await this.isResumeAttached(path)) return null;
      await this.fileStorage.remove(path);
      return null;
    } catch (error) {
      this.logger.error(
        `Previous candidate resume ${path} could not be cleaned up: ${
          error instanceof Error ? error.message : "unknown storage error"
        }`,
      );
      return "Your profile was updated, but an older resume could not be removed from private storage. Contact support if you need it deleted.";
    }
  }

  private withCleanupWarning<T>(
    profile: T,
    storageCleanupWarning: string | null,
  ): T | (T & { storageCleanupWarning: string }) {
    return storageCleanupWarning
      ? { ...profile, storageCleanupWarning }
      : profile;
  }

  private async getOrCreateProfile(
    user: AuthenticatedUser,
  ): Promise<CandidateProfile> {
    const account = await this.usersRepository.findOneBy({
      id: user.id,
      isActive: true,
    });
    if (!account) {
      throw new NotFoundException("Candidate account was not found");
    }

    const existing = await this.profilesRepository.findOneBy({
      userId: user.id,
    });
    if (existing) return existing;
    return this.profilesRepository.save(
      this.profilesRepository.create({
        userId: user.id,
        headline: "",
        location: "",
        phone: "",
        summary: "",
        skills: "[]",
        desiredJobTitles: [],
        employmentTypes: [],
        workplaceTypes: [],
        experience: [],
        education: [],
        links: { linkedin: "", portfolio: "", github: "" },
        shareProfileOnApplication: false,
        applicationEmailUpdates: true,
        jobAlertEmails: false,
      }),
    );
  }

  private isResumeAttached(path: string): Promise<boolean> {
    return this.applicationsRepository.existsBy({ resumePath: path });
  }

  private uniqueValues(values: string[]): string[] {
    return values
      .map((value) => value.trim())
      .filter(Boolean)
      .filter(
        (value, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.toLocaleLowerCase() === value.toLocaleLowerCase(),
          ) === index,
      );
  }

  private validateCareerDates(
    experience: CandidateExperienceDto[] | undefined,
    education: CandidateEducationDto[] | undefined,
  ) {
    for (const [label, entries] of [
      ["Experience", experience ?? []],
      ["Education", education ?? []],
    ] as const) {
      for (const entry of entries) {
        if (entry.endDate && entry.endDate < entry.startDate) {
          throw new BadRequestException(
            `${label} end date cannot be earlier than its start date.`,
          );
        }
      }
    }
  }

  private parseSkills(value: string | undefined): string[] {
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.some((skill) => typeof skill !== "string")
    ) {
      throw new Error("Stored candidate skills have an invalid format");
    }
    return parsed;
  }
}
