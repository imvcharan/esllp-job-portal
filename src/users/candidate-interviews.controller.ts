import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "./user.entity";
import { CandidateInterviewsService } from "./candidate-interviews.service";
import { CandidateInterviewResponseDto } from "./dto/candidate-interview-response.dto";

@Controller("candidate/interviews")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidateInterviewsController {
  constructor(private readonly interviews: CandidateInterviewsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.interviews.listForCandidate(user);
  }

  @Patch(":interviewId/response")
  @Header("Cache-Control", "private, no-store")
  respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param("interviewId", ParseIntPipe) interviewId: number,
    @Body() dto: CandidateInterviewResponseDto,
  ) {
    return this.interviews.respond(user, interviewId, dto);
  }
}
