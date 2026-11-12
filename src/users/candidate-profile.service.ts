import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { DataSource, Repository } from "typeorm";
import { AuthenticatedUser } from "../auth/auth.types";
import { User } from "./user.entity";
import { CandidateProfile } from "./candidate-profile.entity";
import { CandidateFileStorageService } from "./candidate-file-storage.service";
import { CandidateResumeVersion } from "./candidate-resume-version.entity";
import { AuditService } from "../audit/audit.service";
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
    @InjectRepository(CandidateResumeVersion)
    private readonly resumeVersionsRepository: Repository<CandidateResumeVersion>,
    private readonly auditService: AuditService,
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
    const resumeVersions = profile ? await this.listResumeVersions(user) : [];

    return {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      username: account.username,
      phoneNumber: account.phoneE164,
      pendingPhoneNumber: account.pendingPhoneE164,
      phoneVerified: account.phoneVerified,
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
      certifications: profile?.certifications ?? [],
      salaryPreferences: profile?.salaryPreferences ?? {},
      profileVisibility: profile?.profileVisibility ?? "private",
      publicProfileEnabled: profile?.publicProfileEnabled ?? false,
      allowRecruiterContact: profile?.allowRecruiterContact ?? false,
      allowRecruiterResumeAccess: profile?.allowRecruiterResumeAccess ?? false,
      premiumBoostUntil: profile?.premiumBoostUntil ?? null,
      resumeBuilder: profile?.resumeBuilder ?? {},
      parsedResumeText:
        resumeVersions.find((version) => version.active)?.parsedText ?? "",
      resumeVersions,
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
          certifications: [],
          salaryPreferences: {},
          profileVisibility: "private",
          publicProfileEnabled: false,
          allowRecruiterContact: false,
          allowRecruiterResumeAccess: false,
          resumeBuilder: {},
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
      if (dto.certifications !== undefined)
        profile.certifications = dto.certifications.map((item) => ({
          name: item.name.trim(),
          issuer: item.issuer?.trim() ?? "",
          issueDate: item.issueDate?.trim() ?? "",
          credentialUrl: item.credentialUrl?.trim() ?? "",
        }));
      if (dto.salaryPreferences !== undefined)
        profile.salaryPreferences = {
          ...profile.salaryPreferences,
          ...dto.salaryPreferences,
        };
      if (dto.profileVisibility !== undefined)
        profile.profileVisibility = dto.profileVisibility;
      if (dto.publicProfileEnabled !== undefined)
        profile.publicProfileEnabled = dto.publicProfileEnabled;
      if (dto.allowRecruiterContact !== undefined)
        profile.allowRecruiterContact = dto.allowRecruiterContact;
      if (dto.allowRecruiterResumeAccess !== undefined)
        profile.allowRecruiterResumeAccess = dto.allowRecruiterResumeAccess;
      if (dto.resumeBuilder !== undefined)
        profile.resumeBuilder = {
          ...profile.resumeBuilder,
          ...dto.resumeBuilder,
        };
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

    await this.auditService.record({
      actorUserId: user.id,
      action: "candidate.profile_updated",
      targetType: "user",
      targetId: user.id,
      details: {
        fields: Object.keys(dto).sort().join(","),
        fieldCount: Object.keys(dto).length,
      },
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
    await this.auditService.record({
      actorUserId: user.id,
      action: "candidate.profile_photo_uploaded",
      targetType: "user",
      targetId: user.id,
    });
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
    await this.auditService.record({
      actorUserId: user.id,
      action: "candidate.profile_photo_removed",
      targetType: "user",
      targetId: user.id,
    });
    return this.withCleanupWarning(await this.get(user), storageCleanupWarning);
  }

  async uploadResume(
    user: AuthenticatedUser,
    file: Uint8Array,
    originalName: string,
    mimeType: string,
  ) {
    const profile = await this.getOrCreateProfile(user);
    const parsedText = await this.extractResumeText(file, mimeType);
    const safeFileName = originalName
      .replace(/[\/\\\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(-180);
    const extension = mimeType === "application/pdf" ? "pdf" : "docx";
    const path = this.fileStorage.newObjectPath(user.id, "resume", extension);
    await this.fileStorage.upload(path, mimeType, file);
    try {
      await this.dataSource.transaction(async (manager) => {
        profile.resumePath = path;
        profile.resumeFileName = safeFileName || `resume.${extension}`;
        await manager.getRepository(CandidateProfile).save(profile);
        await manager.getRepository(CandidateResumeVersion).save({
          userId: user.id,
          storagePath: path,
          fileName: profile.resumeFileName,
          mimeType,
          parsedText,
        });
      });
    } catch (error) {
      await this.cleanupFailedUpload(path, error);
      throw error;
    }
    await this.auditService.record({
      actorUserId: user.id,
      action: "candidate.resume_uploaded",
      targetType: "user",
      targetId: user.id,
      details: { fileName: safeFileName || `resume.${extension}`, mimeType },
    });
    return this.get(user);
  }

  async listResumeVersions(user: AuthenticatedUser) {
    const profile = await this.profilesRepository.findOneBy({
      userId: user.id,
    });
    const versions = await this.resumeVersionsRepository.find({
      where: { userId: user.id },
      order: { createdAt: "DESC", id: "DESC" },
      take: 20,
    });
    return Promise.all(
      versions.map(async (version) => ({
        id: version.id,
        fileName: version.fileName,
        mimeType: version.mimeType,
        parsedText: version.parsedText,
        createdAt: version.createdAt,
        active: profile?.resumePath === version.storagePath,
        url: await this.fileStorage.createSignedUrl(version.storagePath),
      })),
    );
  }

  async restoreResumeVersion(user: AuthenticatedUser, versionId: number) {
    const version = await this.resumeVersionsRepository.findOneBy({
      id: versionId,
      userId: user.id,
    });
    if (!version) throw new NotFoundException("Resume version was not found.");
    const profile = await this.getOrCreateProfile(user);
    profile.resumePath = version.storagePath;
    profile.resumeFileName = version.fileName;
    await this.profilesRepository.save(profile);
    await this.auditService.record({
      actorUserId: user.id,
      action: "candidate.resume_version_restored",
      targetType: "candidate_resume_version",
      targetId: version.id,
    });
    return this.get(user);
  }

  async removeResume(user: AuthenticatedUser) {
    const profile = await this.getOrCreateProfile(user);
    profile.resumePath = null;
    profile.resumeFileName = null;
    await this.profilesRepository.save(profile);
    await this.auditService.record({
      actorUserId: user.id,
      action: "candidate.resume_removed",
      targetType: "user",
      targetId: user.id,
    });
    return this.get(user);
  }

  private async extractResumeText(
    file: Uint8Array,
    mimeType: string,
  ): Promise<string> {
    const buffer = Buffer.from(file);
    try {
      const text =
        mimeType === "application/pdf"
          ? (await pdfParse(buffer, { max: 50 })).text
          : (
              await mammoth.extractRawText({
                buffer: this.validateDocxArchive(buffer),
              })
            ).value;
      const normalized = text
        .replace(/\u0000/g, "")
        .replace(/\r\n?/g, "\n")
        .trim()
        .slice(0, 100_000);
      if (!normalized) {
        throw new BadRequestException(
          "No selectable text was found in the resume. Upload a text-based PDF or DOCX.",
        );
      }
      return normalized;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        "The resume could not be parsed. Upload a valid text-based PDF or DOCX.",
        { cause: error },
      );
    }
  }

  private validateDocxArchive(buffer: Buffer): Buffer {
    const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
    const eocdOffset = buffer.lastIndexOf(
      eocdSignature,
      Math.max(0, buffer.length - 22),
    );
    if (eocdOffset < 0 || eocdOffset + 22 > buffer.length) {
      throw new BadRequestException("The DOCX archive is invalid.");
    }
    const entryCount = buffer.readUInt16LE(eocdOffset + 10);
    const directorySize = buffer.readUInt32LE(eocdOffset + 12);
    const directoryOffset = buffer.readUInt32LE(eocdOffset + 16);
    if (
      entryCount > 500 ||
      directorySize === 0xffffffff ||
      directoryOffset === 0xffffffff ||
      directoryOffset + directorySize > eocdOffset
    ) {
      throw new BadRequestException(
        "The DOCX archive is too large or uses an unsupported format.",
      );
    }

    let offset = directoryOffset;
    let expandedBytes = 0;
    let foundDocument = false;
    for (let index = 0; index < entryCount; index += 1) {
      if (
        offset + 46 > directoryOffset + directorySize ||
        buffer.readUInt32LE(offset) !== 0x02014b50
      ) {
        throw new BadRequestException("The DOCX archive is invalid.");
      }
      const flags = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const uncompressedSize = buffer.readUInt32LE(offset + 24);
      const nameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
      if (
        flags & 1 ||
        uncompressedSize === 0xffffffff ||
        nextOffset > directoryOffset + directorySize ||
        uncompressedSize > 8 * 1024 * 1024 ||
        compressedSize > buffer.length
      ) {
        throw new BadRequestException(
          "The DOCX archive is encrypted, oversized, or invalid.",
        );
      }
      expandedBytes += uncompressedSize;
      if (expandedBytes > 24 * 1024 * 1024) {
        throw new BadRequestException(
          "The DOCX expands beyond the supported size limit.",
        );
      }
      const name = buffer
        .subarray(offset + 46, offset + 46 + nameLength)
        .toString("utf8");
      if (name.split(/[\\/]/).includes("..")) {
        throw new BadRequestException(
          "The DOCX archive contains an invalid path.",
        );
      }
      if (name === "word/document.xml") foundDocument = true;
      offset = nextOffset;
    }
    if (!foundDocument) {
      throw new BadRequestException("The DOCX archive has no document body.");
    }
    return buffer;
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
        certifications: [],
        salaryPreferences: {},
        profileVisibility: "private",
        allowRecruiterContact: false,
        resumeBuilder: {},
        links: { linkedin: "", portfolio: "", github: "" },
        shareProfileOnApplication: false,
        applicationEmailUpdates: true,
        jobAlertEmails: false,
      }),
    );
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
