import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "./user.entity";
import { CandidateRecommendationsService } from "./candidate-recommendations.service";

@Controller("candidate/recommendations")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidateRecommendationsController {
  constructor(
    private readonly recommendations: CandidateRecommendationsService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.getForCandidate(user);
  }
}
