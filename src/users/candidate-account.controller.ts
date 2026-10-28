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
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "./user.entity";
import { CandidateAccountService } from "./candidate-account.service";
import { CreateCandidateDeletionRequestDto } from "./dto/create-candidate-deletion-request.dto";
import { UpdateCandidateDeletionRequestDto } from "./dto/update-candidate-deletion-request.dto";

@Controller("candidate/account")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidateAccountController {
  constructor(private readonly accountService: CandidateAccountService) {}

  @Get("export")
  @Header("Cache-Control", "private, no-store")
  @Header("Content-Type", "application/json")
  @Header(
    "Content-Disposition",
    'attachment; filename="esllp-account-export.json"',
  )
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  exportData(@CurrentUser() user: AuthenticatedUser) {
    return this.accountService.exportCandidateData(user);
  }

  @Get("deletion-request")
  @Header("Cache-Control", "private, no-store")
  getDeletionRequest(@CurrentUser() user: AuthenticatedUser) {
    return this.accountService.getDeletionRequest(user);
  }

  @Post("deletion-request")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store")
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  requestDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCandidateDeletionRequestDto,
  ) {
    return this.accountService.requestDeletion(user, dto);
  }
}

@Controller("admin/privacy-requests")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class AdminPrivacyRequestsController {
  constructor(private readonly accountService: CandidateAccountService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query("limit", new DefaultValuePipe(25), ParseIntPipe) limit = 25,
  ) {
    return this.accountService.listDeletionRequests(page, limit);
  }

  @Patch(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCandidateDeletionRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.accountService.reviewDeletionRequest(
      id,
      dto,
      actor,
      request.ip,
    );
  }
}
