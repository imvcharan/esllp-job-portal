import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthenticatedUser } from "../auth/auth.types";
import { Job } from "../jobs/job.entity";
import {
  CandidateSavedSearch,
  CandidateSavedSearchFilters,
} from "./candidate-saved-search.entity";
import { CreateCandidateSavedSearchDto } from "./dto/create-candidate-saved-search.dto";
import { UpdateCandidateSavedSearchDto } from "./dto/update-candidate-saved-search.dto";

@Injectable()
export class CandidateSavedSearchesService {
  constructor(
    @InjectRepository(CandidateSavedSearch)
    private readonly savedSearchesRepository: Repository<CandidateSavedSearch>,
  ) {}

  list(user: AuthenticatedUser) {
    return this.savedSearchesRepository.find({
      where: { userId: user.id },
      order: { createdAt: "DESC", id: "DESC" },
    });
  }

  async create(user: AuthenticatedUser, dto: CreateCandidateSavedSearchDto) {
    const count = await this.savedSearchesRepository.countBy({
      userId: user.id,
    });
    if (count >= 25) {
      throw new BadRequestException("You can save up to 25 searches.");
    }
    return this.savedSearchesRepository.save(
      this.savedSearchesRepository.create({
        userId: user.id,
        name: dto.name.trim(),
        query: dto.query?.trim() ?? "",
        location: dto.location?.trim() ?? "",
        filters: this.toFilters(dto),
        emailAlerts: dto.emailAlerts ?? false,
      }),
    );
  }

  async update(
    user: AuthenticatedUser,
    id: number,
    dto: UpdateCandidateSavedSearchDto,
  ) {
    const savedSearch = await this.findOwned(user, id);
    if (dto.name !== undefined) savedSearch.name = dto.name.trim();
    if (dto.query !== undefined) savedSearch.query = dto.query.trim();
    if (dto.location !== undefined) savedSearch.location = dto.location.trim();
    if (dto.emailAlerts !== undefined)
      savedSearch.emailAlerts = dto.emailAlerts;
    if (
      dto.workplaceType !== undefined ||
      dto.employmentType !== undefined ||
      dto.experience !== undefined ||
      dto.company !== undefined ||
      dto.minimumSalary !== undefined ||
      dto.freshnessDays !== undefined ||
      dto.sort !== undefined
    ) {
      savedSearch.filters = {
        ...savedSearch.filters,
        ...this.toFilters(dto),
      };
    }
    return this.savedSearchesRepository.save(savedSearch);
  }

  async remove(user: AuthenticatedUser, id: number) {
    const savedSearch = await this.findOwned(user, id);
    await this.savedSearchesRepository.remove(savedSearch);
    return { success: true };
  }

  async matchingForJob(job: Job) {
    const searches = await this.savedSearchesRepository.findBy({
      emailAlerts: true,
    });
    const title = job.title.toLocaleLowerCase();
    const company = job.company.toLocaleLowerCase();
    const location = job.location.toLocaleLowerCase();
    return searches.filter((search) => {
      const filters = search.filters;
      const query = search.query.trim().toLocaleLowerCase();
      const roleMatches =
        !query ||
        title.includes(query) ||
        company.includes(query) ||
        Boolean(job.description?.toLocaleLowerCase().includes(query));
      const locationMatches =
        !search.location ||
        location.includes(search.location.toLocaleLowerCase());
      const workplaceMatches =
        !filters.workplaceType || filters.workplaceType === job.workplaceType;
      const employmentMatches =
        !filters.employmentType ||
        filters.employmentType === job.employmentType;
      const years = job.experience?.match(/\d+/g)?.map(Number) ?? [];
      const experienceMatches =
        !filters.experience ||
        (filters.experience === "early" &&
          years.length > 0 &&
          Math.min(...years) <= 2) ||
        (filters.experience === "mid" &&
          years.length > 0 &&
          Math.min(...years) <= 5 &&
          (years.length > 1
            ? Math.max(...years) >= 3
            : job.experience?.includes("+") || years[0] >= 3)) ||
        (filters.experience === "senior" &&
          years.length > 0 &&
          (years.length > 1
            ? Math.max(...years) >= 5
            : job.experience?.includes("+") || years[0] >= 5));
      const companyMatches =
        !filters.company || filters.company.toLocaleLowerCase() === company;
      const salaryMatches =
        !filters.minimumSalary ||
        (job.salaryMin !== null && job.salaryMin >= filters.minimumSalary);
      const freshnessMatches =
        !filters.freshnessDays ||
        job.createdAt.getTime() >=
          Date.now() - filters.freshnessDays * 24 * 60 * 60 * 1000;
      return (
        roleMatches &&
        locationMatches &&
        workplaceMatches &&
        employmentMatches &&
        experienceMatches &&
        companyMatches &&
        salaryMatches &&
        freshnessMatches
      );
    });
  }

  private async findOwned(user: AuthenticatedUser, id: number) {
    const savedSearch = await this.savedSearchesRepository.findOneBy({
      id,
      userId: user.id,
    });
    if (!savedSearch) {
      throw new NotFoundException("Saved search was not found.");
    }
    return savedSearch;
  }

  private toFilters(
    dto: CreateCandidateSavedSearchDto | UpdateCandidateSavedSearchDto,
  ): CandidateSavedSearchFilters {
    return {
      ...(dto.workplaceType
        ? {
            workplaceType:
              dto.workplaceType as CandidateSavedSearchFilters["workplaceType"],
          }
        : {}),
      ...(dto.employmentType
        ? {
            employmentType:
              dto.employmentType as CandidateSavedSearchFilters["employmentType"],
          }
        : {}),
      ...(dto.experience
        ? {
            experience:
              dto.experience as CandidateSavedSearchFilters["experience"],
          }
        : {}),
      ...(dto.company?.trim() ? { company: dto.company.trim() } : {}),
      ...(dto.minimumSalary !== undefined
        ? { minimumSalary: dto.minimumSalary }
        : {}),
      ...(dto.freshnessDays !== undefined
        ? { freshnessDays: dto.freshnessDays }
        : {}),
      ...(dto.sort
        ? { sort: dto.sort as CandidateSavedSearchFilters["sort"] }
        : {}),
    };
  }
}
