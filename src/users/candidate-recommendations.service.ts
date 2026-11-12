import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthenticatedUser } from "../auth/auth.types";
import { currentJobDeadlineDate } from "../jobs/job.constants";
import { Job } from "../jobs/job.entity";
import { CandidateProfile } from "./candidate-profile.entity";

type Recommendation = {
  job: Job;
  score: number;
  reasons: string[];
};

@Injectable()
export class CandidateRecommendationsService {
  constructor(
    @InjectRepository(CandidateProfile)
    private readonly profiles: Repository<CandidateProfile>,
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
  ) {}

  async getForCandidate(user: AuthenticatedUser) {
    const profile = await this.profiles.findOneBy({ userId: user.id });
    const jobs = await this.jobs
      .createQueryBuilder("job")
      .where("job.isActive = true")
      .andWhere(
        "(job.applicationDeadline IS NULL OR job.applicationDeadline >= :today)",
        { today: currentJobDeadlineDate() },
      )
      .orderBy("job.createdAt", "DESC")
      .take(500)
      .getMany();

    const hasSkills = profile ? this.parseSkills(profile.skills).length > 0 : false;
    const preferencesAvailable = Boolean(
      profile &&
        (profile.desiredJobTitles.length ||
          hasSkills ||
          profile.location ||
          profile.workplaceTypes.length ||
          profile.employmentTypes.length ||
          profile.salaryPreferences.minimum),
    );
    if (!profile || !preferencesAvailable) {
      return {
        items: [],
        personalized: false,
        message:
          "Add your skills, preferred roles, location, or work preferences to your profile to get personalized job recommendations.",
      };
    }

    const ranked = jobs
      .map((job) => this.score(profile, job))
      .filter((recommendation): recommendation is Recommendation =>
        Boolean(recommendation && recommendation.score > 0),
      )
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.job.createdAt.getTime() - left.job.createdAt.getTime(),
      )
      .slice(0, 20);
    return {
      items: ranked.map(({ job, score, reasons }) => ({
        job,
        score,
        reasons,
      })),
      personalized: true,
      message: ranked.length
        ? null
        : "No published jobs currently match your saved preferences. Try broadening your profile or job search.",
    };
  }

  private score(profile: CandidateProfile, job: Job): Recommendation | null {
    const title = job.title.toLocaleLowerCase();
    const description = (job.description ?? "").toLocaleLowerCase();
    const location = job.location.toLocaleLowerCase();
    const reasons: string[] = [];
    let score = 0;
    const roleMatches = profile.desiredJobTitles.filter((desired) => {
      const target = desired.toLocaleLowerCase();
      return title.includes(target) || target.includes(title);
    });
    if (roleMatches.length) {
      score += 4;
      reasons.push(`Role matches ${roleMatches[0]}`);
    }
    const skills = this.parseSkills(profile.skills);
    const matchedSkills = skills.filter((skill) => {
      const term = skill.toLocaleLowerCase();
      return title.includes(term) || description.includes(term);
    });
    if (matchedSkills.length) {
      score += Math.min(3, matchedSkills.length);
      reasons.push(`Skills match: ${matchedSkills.slice(0, 3).join(", ")}`);
    }
    const preferredLocations = profile.location
      .split(/[,;|]/)
      .map((value) => value.trim().toLocaleLowerCase())
      .filter(Boolean);
    if (
      preferredLocations.some(
        (preferred) =>
          location.includes(preferred) ||
          (preferred.includes("remote") && job.workplaceType === "remote"),
      )
    ) {
      score += 2;
      reasons.push("Location matches your preference");
    }
    if (
      profile.workplaceTypes.length &&
      profile.workplaceTypes.includes(job.workplaceType)
    ) {
      score += 1;
      reasons.push(`${job.workplaceType} work preference`);
    }
    if (
      profile.employmentTypes.length &&
      profile.employmentTypes.includes(job.employmentType)
    ) {
      score += 1;
      reasons.push(`${job.employmentType} employment preference`);
    }
    const salary = profile.salaryPreferences;
    if (salary.minimum) {
      if (
        salary.currency &&
        salary.currency !== job.salaryCurrency
      ) {
        return null;
      }
      if (salary.period && salary.period !== job.salaryPeriod) return null;
      if (job.salaryMin === null || job.salaryMin < salary.minimum) return null;
      score += 1;
      reasons.push("Meets your minimum salary");
    }
    return { job, score, reasons };
  }

  private parseSkills(value: string): string[] {
    const parsed: unknown = JSON.parse(value || "[]");
    if (
      !Array.isArray(parsed) ||
      parsed.some((skill) => typeof skill !== "string")
    ) {
      throw new Error("Stored candidate skills have an invalid format");
    }
    return parsed;
  }
}
