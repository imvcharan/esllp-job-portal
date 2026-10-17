import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../users/user.entity";
import {
  CreateEmployerJobDto,
  UpdateEmployerJobDto,
} from "./dto/employer-job.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import {
  AcceptTeamInviteDto,
  CreateEmployerSubscriptionDto,
  CreateEmployerInterviewDto,
  CreateEmployerNoteDto,
  EmployerApplicantsQueryDto,
  EmployerTagDto,
  InviteTeamMemberDto,
  UpdateTeamMemberDto,
  VerifyRazorpaySubscriptionDto,
} from "./dto/employer-workflow.dto";
import { UpdateApplicationStatusDto } from "../users/dto/update-application-status.dto";
import { EmployersService } from "./employers.service";
import {
  AllowPendingEmployerReadOnly,
  EmployerApprovalGuard,
} from "./employer-approval.guard";

function optionalOrganizationId(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new BadRequestException(
      "X-Organization-Id must be a positive integer.",
    );
  return id;
}

@Controller("employer")
@UseGuards(JwtAuthGuard, RolesGuard, EmployerApprovalGuard)
@Roles(UserRole.EMPLOYER)
export class EmployersController {
  constructor(private readonly employersService: EmployersService) {}

  @Get("organizations")
  @Header("Cache-Control", "private, no-store")
  @AllowPendingEmployerReadOnly()
  organizations(@CurrentUser() user: AuthenticatedUser) {
    return this.employersService.listOrganizations(user);
  }

  @Get("dashboard")
  @Header("Cache-Control", "private, no-store")
  @AllowPendingEmployerReadOnly()
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.getDashboard(
      user,
      optionalOrganizationId(organizationId),
    );
  }

  @Get("company")
  @Header("Cache-Control", "private, no-store")
  @AllowPendingEmployerReadOnly()
  company(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.getCompany(
      user,
      optionalOrganizationId(organizationId),
    );
  }

  @Patch("company")
  updateCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.updateCompany(
      user,
      dto,
      optionalOrganizationId(organizationId),
    );
  }

  @Get("jobs")
  @Header("Cache-Control", "private, no-store")
  @AllowPendingEmployerReadOnly()
  jobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query("limit", new DefaultValuePipe(25), ParseIntPipe) limit = 25,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.listJobs(
      user,
      page,
      limit,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("jobs")
  createJob(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployerJobDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.createJob(
      user,
      dto,
      optionalOrganizationId(organizationId),
    );
  }

  @Patch("jobs/:jobId")
  updateJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param("jobId", ParseIntPipe) jobId: number,
    @Body() dto: UpdateEmployerJobDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.updateJob(
      user,
      jobId,
      dto,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("jobs/:jobId/publish")
  publishJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param("jobId", ParseIntPipe) jobId: number,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.publishJob(
      user,
      jobId,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("jobs/:jobId/close")
  closeJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param("jobId", ParseIntPipe) jobId: number,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.closeJob(
      user,
      jobId,
      optionalOrganizationId(organizationId),
    );
  }

  @Get("applications")
  applications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmployerApplicantsQueryDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.listApplicants(
      user,
      query,
      optionalOrganizationId(organizationId),
    );
  }

  @Patch("applications/:applicationId/status")
  updateApplicationStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId", ParseIntPipe) applicationId: number,
    @Body() body: UpdateApplicationStatusDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.updateApplicationStatus(
      user,
      applicationId,
      body.status,
      body.note,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("applications/:applicationId/notes")
  addApplicationNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId", ParseIntPipe) applicationId: number,
    @Body() dto: CreateEmployerNoteDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.addApplicationNote(
      user,
      applicationId,
      dto,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("applications/:applicationId/tags")
  addApplicationTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId", ParseIntPipe) applicationId: number,
    @Body() dto: EmployerTagDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.addApplicationTag(
      user,
      applicationId,
      dto.label,
      optionalOrganizationId(organizationId),
    );
  }

  @Delete("applications/:applicationId/tags/:tagId")
  removeApplicationTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId", ParseIntPipe) applicationId: number,
    @Param("tagId", ParseIntPipe) tagId: number,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.removeApplicationTag(
      user,
      applicationId,
      tagId,
      optionalOrganizationId(organizationId),
    );
  }

  @Get("interviews")
  interviews(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.listInterviews(
      user,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("applications/:applicationId/interviews")
  createInterview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId", ParseIntPipe) applicationId: number,
    @Body() dto: CreateEmployerInterviewDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.createInterview(
      user,
      applicationId,
      dto,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("interviews/:interviewId/cancel")
  cancelInterview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("interviewId", ParseIntPipe) interviewId: number,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.cancelInterview(
      user,
      interviewId,
      optionalOrganizationId(organizationId),
    );
  }

  @Get("team")
  team(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.listTeam(
      user,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("team/invitations")
  inviteTeamMember(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteTeamMemberDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.inviteTeamMember(
      user,
      dto,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("team/:memberId/resend")
  resendTeamInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("memberId", ParseIntPipe) memberId: number,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.resendTeamInvite(
      user,
      memberId,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("team/accept")
  acceptTeamInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AcceptTeamInviteDto,
  ) {
    return this.employersService.acceptTeamInvite(user, body.token);
  }

  @Patch("team/:memberId")
  updateTeamMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("memberId", ParseIntPipe) memberId: number,
    @Body() dto: UpdateTeamMemberDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.updateTeamMember(
      user,
      memberId,
      dto,
      optionalOrganizationId(organizationId),
    );
  }

  @Get("notifications")
  notifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
  ) {
    return this.employersService.listNotifications(user, page);
  }

  @Patch("notifications/:notificationId/read")
  markNotificationRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param("notificationId", ParseIntPipe) notificationId: number,
  ) {
    return this.employersService.markNotificationRead(user, notificationId);
  }

  @Get("billing")
  billing(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.billingSummary(
      user,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("billing/subscribe")
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateEmployerSubscriptionDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.createSubscription(
      user,
      body.planKey,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("billing/verify")
  verifySubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: VerifyRazorpaySubscriptionDto,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.verifySubscription(
      user,
      body,
      optionalOrganizationId(organizationId),
    );
  }

  @Post("billing/cancel")
  cancelSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-organization-id") organizationId?: string,
  ) {
    return this.employersService.cancelSubscription(
      user,
      optionalOrganizationId(organizationId),
    );
  }
}
