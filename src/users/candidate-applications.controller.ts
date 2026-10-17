import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "./user.entity";
import { CandidateApplicationsService } from "./candidate-applications.service";
import { SubmitCandidateApplicationDto } from "./dto/submit-candidate-application.dto";

@Controller("candidate/applications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidateApplicationsController {
  constructor(
    private readonly applicationsService: CandidateApplicationsService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.applicationsService.list(user, page, limit);
  }

  @Get(":jobId")
  @Header("Cache-Control", "private, no-store")
  getForJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param("jobId", ParseIntPipe) jobId: number,
  ) {
    return this.applicationsService.getForJob(user, jobId);
  }

  @Post(":jobId")
  @Header("Cache-Control", "private, no-store")
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("jobId", ParseIntPipe) jobId: number,
    @Body() dto: SubmitCandidateApplicationDto,
  ) {
    return this.applicationsService.submit(user, jobId, dto);
  }

  @Post("records/:applicationId/withdraw")
  @Header("Cache-Control", "private, no-store")
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId", ParseIntPipe) applicationId: number,
  ) {
    return this.applicationsService.withdraw(user, applicationId);
  }
}
