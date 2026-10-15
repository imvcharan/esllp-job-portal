import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  findAll(
    @Query('q') query?: string,
    @Query('location') location?: string,
  ) {
    return this.jobsService.findAll({ query, location });
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const job = await this.jobsService.findOne(id);
    if (!job) {
      throw new NotFoundException(`Job ${id} was not found`);
    }
    return job;
  }
}
