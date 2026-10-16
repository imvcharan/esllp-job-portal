import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from './user.entity';
import { CandidateSavedJobsService } from './candidate-saved-jobs.service';

@Controller('candidate/saved-jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidateSavedJobsController {
  constructor(private readonly savedJobsService: CandidateSavedJobsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.savedJobsService.list(user);
  }

  @Post(':jobId')
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', ParseIntPipe) jobId: number,
  ) {
    return this.savedJobsService.add(user, jobId);
  }

  @Delete(':jobId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', ParseIntPipe) jobId: number,
  ) {
    return this.savedJobsService.remove(user, jobId);
  }
}
