import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UserRole } from "../users/user.entity";
import { UpdateUserRoleDto } from "./dto/update-user-role.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UpdateEmployerApprovalDto } from "./dto/update-employer-approval.dto";
import { CreateManagedUserDto } from "./dto/create-managed-user.dto";
import { AdminUsersService } from "./admin-users.service";

@Controller("admin/users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query("limit", new DefaultValuePipe(25), ParseIntPipe) limit = 25,
    @Query("role", new ParseEnumPipe(UserRole, { optional: true }))
    role?: UserRole,
  ) {
    return this.adminUsersService.list(page, limit, role);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Body() dto: CreateManagedUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminUsersService.create(
      actor.id,
      dto,
      request.ip,
    );
  }

  @Patch(":id/role")
  changeRole(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminUsersService.changeRole(
      actor.id,
      id,
      dto.role,
      request.ip,
    );
  }

  @Patch(":id/status")
  changeStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminUsersService.changeStatus(
      actor.id,
      id,
      dto.isActive,
      request.ip,
    );
  }

  @Patch(":id/employer-approval")
  setEmployerApproval(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateEmployerApprovalDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminUsersService.setEmployerApproval(
      actor.id,
      id,
      dto.status,
      request.ip,
    );
  }
}
