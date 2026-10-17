import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from "@nestjs/common";
import { JobsService } from "./jobs.service";

@Controller("jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  findAll(
    @Query("q") query?: string,
    @Query("location") location?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit = 20,
    @Query("workplaceType") workplaceType?: string,
    @Query("employmentType") employmentType?: string,
    @Query("experience") experience?: string,
    @Query("company") company?: string,
    @Query("minimumSalary", new DefaultValuePipe(0), ParseIntPipe)
    minimumSalary = 0,
    @Query("freshnessDays", new DefaultValuePipe(0), ParseIntPipe)
    freshnessDays = 0,
    @Query("sort") sort?: string,
  ) {
    return this.jobsService.findAll({
      query,
      location,
      page,
      limit,
      workplaceType,
      employmentType,
      experience,
      company,
      minimumSalary,
      freshnessDays,
      sort,
    });
  }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const job = await this.jobsService.findOne(id);
    if (!job) {
      throw new NotFoundException(`Job ${id} was not found`);
    }
    return job;
  }
}
