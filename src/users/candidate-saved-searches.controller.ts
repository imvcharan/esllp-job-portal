import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "./user.entity";
import { CandidateSavedSearchesService } from "./candidate-saved-searches.service";
import { CreateCandidateSavedSearchDto } from "./dto/create-candidate-saved-search.dto";
import { UpdateCandidateSavedSearchDto } from "./dto/update-candidate-saved-search.dto";

@Controller("candidate/saved-searches")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidateSavedSearchesController {
  constructor(
    private readonly savedSearchesService: CandidateSavedSearchesService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.savedSearchesService.list(user);
  }

  @Post()
  @Header("Cache-Control", "private, no-store")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCandidateSavedSearchDto,
  ) {
    return this.savedSearchesService.create(user, dto);
  }

  @Patch(":id")
  @Header("Cache-Control", "private, no-store")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCandidateSavedSearchDto,
  ) {
    return this.savedSearchesService.update(user, id, dto);
  }

  @Delete(":id")
  @Header("Cache-Control", "private, no-store")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.savedSearchesService.remove(user, id);
  }
}
