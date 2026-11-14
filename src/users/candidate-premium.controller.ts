import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "./user.entity";
import {
  CreateCandidatePremiumCheckoutDto,
  UpdateCandidatePremiumFulfillmentDto,
  CreateCandidatePremiumProductDto,
  DeleteCandidatePremiumProductDto,
  UpdateCandidatePremiumProductDto,
  VerifyCandidatePremiumPaymentDto,
} from "./dto/candidate-premium.dto";
import { CandidatePremiumService } from "./candidate-premium.service";

@Controller("candidate/premium")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidatePremiumController {
  constructor(private readonly premium: CandidatePremiumService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.premium.candidateSummary(user);
  }

  @Post("checkout")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCandidatePremiumCheckoutDto,
  ) {
    return this.premium.createCheckout(user, dto.productKey);
  }

  @Post("verify")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyCandidatePremiumPaymentDto,
  ) {
    return this.premium.verifyPayment(user, dto);
  }
}

@Controller("admin/candidate-premium")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class AdminCandidatePremiumController {
  constructor(private readonly premium: CandidatePremiumService) {}

  @Get("products")
  products() {
    return this.premium.adminProducts();
  }

  @Post("products")
  createProduct(
    @Body() dto: CreateCandidatePremiumProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.premium.createProduct(dto, user);
  }

  @Patch("products/:key")
  updateProduct(
    @Param("key") key: string,
    @Body() dto: UpdateCandidatePremiumProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.premium.updateProduct(key, dto, user);
  }

  @Delete("products/:key")
  deleteProduct(
    @Param("key") key: string,
    @Body() dto: DeleteCandidatePremiumProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.premium.disableProduct(key, dto.reason, user);
  }

  @Get("orders")
  @Header("Cache-Control", "private, no-store")
  orders() {
    return this.premium.adminOrders();
  }

  @Get("revenue")
  @Header("Cache-Control", "private, no-store")
  revenue() {
    return this.premium.adminRevenue();
  }

  @Patch("orders/:id/fulfillment")
  fulfillment(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCandidatePremiumFulfillmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.premium.updateFulfillment(id, dto, user);
  }
}

@Controller("billing/razorpay")
export class CandidatePremiumWebhookController {
  constructor(private readonly premium: CandidatePremiumService) {}

  @Post("candidate-webhook")
  @HttpCode(HttpStatus.OK)
  handle(@Req() request: RawBodyRequest<Request>) {
    return this.premium.handleRazorpayWebhook(
      request.rawBody,
      request.get("x-razorpay-signature"),
      request.body as Record<string, unknown>,
    );
  }
}
