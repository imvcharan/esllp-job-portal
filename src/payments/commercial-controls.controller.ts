import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../users/user.entity";
import { CommercialControlsService } from "./commercial-controls.service";
import { CreatePaymentCouponDto, CreatePaymentRefundDto, ReviewPaymentRefundDto } from "./dto/commercial-control.dto";

@Controller("admin/commercial")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class AdminCommercialControlsController {
  constructor(private readonly service: CommercialControlsService) {}

  @Get("coupons") coupons() { return this.service.listCoupons(); }
  @Post("coupons") createCoupon(@Body() dto: CreatePaymentCouponDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.createCoupon(dto, actor);
  }
  @Get("refunds") refunds() { return this.service.listRefunds(); }
  @Post("refunds") createRefund(@Body() dto: CreatePaymentRefundDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.createRefund(dto, actor);
  }
  @Patch("refunds/:id") reviewRefund(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ReviewPaymentRefundDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.reviewRefund(id, dto, actor);
  }
}
