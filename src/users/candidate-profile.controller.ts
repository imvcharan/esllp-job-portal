import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from './user.entity';
import { CandidateProfileService } from './candidate-profile.service';
import { UpdateCandidateProfileDto } from './dto/update-candidate-profile.dto';

@Controller('candidate/profile')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidateProfileController {
  constructor(private readonly profileService: CandidateProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.get(user);
  }

  @Put()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCandidateProfileDto,
  ) {
    return this.profileService.update(user, dto);
  }
}
