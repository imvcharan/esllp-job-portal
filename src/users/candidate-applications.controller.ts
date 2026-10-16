import {
  Body,
  Controller,
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
import { CandidateApplicationsService } from './candidate-applications.service';
import { SubmitCandidateApplicationDto } from './dto/submit-candidate-application.dto';

@Controller('candidate/applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidateApplicationsController {
  constructor(
    private readonly applicationsService: CandidateApplicationsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.applicationsService.list(user);
  }

  @Get(':jobId')
  getForJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', ParseIntPipe) jobId: number,
  ) {
    return this.applicationsService.getForJob(user, jobId);
  }

  @Post(':jobId')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', ParseIntPipe) jobId: number,
    @Body() dto: SubmitCandidateApplicationDto,
  ) {
    return this.applicationsService.submit(user, jobId, dto);
  }
}
