import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../users/user.entity";
import { AdminInsightsService } from "./admin-insights.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
export class AdminInsightsController {
  constructor(private readonly insightsService: AdminInsightsService) {}

  @Get("insights")
  overview() {
    return this.insightsService.overview();
  }

  @Get("companies")
  companies() {
    return this.insightsService.companies();
  }

  @Get("activity")
  @Header("Cache-Control", "private, no-store")
  activity() {
    return this.insightsService.activity();
  }
}
