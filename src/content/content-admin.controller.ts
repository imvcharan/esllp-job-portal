import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../users/user.entity";
import { ContentService } from "./content.service";
import { CreateContentEntryDto } from "./dto/create-content-entry.dto";
import { UpdateContentEntryDto } from "./dto/update-content-entry.dto";

@Controller("admin/content")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPERADMIN)
export class ContentAdminController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  list() {
    return this.contentService.listAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(
    @Body() dto: CreateContentEntryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.contentService.create(actor.id, dto, request.ip);
  }

  @Patch(":id")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateContentEntryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.contentService.update(actor.id, id, dto, request.ip);
  }

  @Get(":id/revisions")
  revisions(@Param("id", ParseIntPipe) id: number) {
    return this.contentService.listRevisions(id);
  }

  @Post(":id/revisions/:revisionId/restore")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  restoreRevision(
    @Param("id", ParseIntPipe) id: number,
    @Param("revisionId", ParseIntPipe) revisionId: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.contentService.restoreRevision(
      actor.id,
      id,
      revisionId,
      request.ip,
    );
  }
}
