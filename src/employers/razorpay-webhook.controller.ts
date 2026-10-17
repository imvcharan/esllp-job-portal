import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { EmployersService } from "./employers.service";

@Controller("billing/razorpay")
export class RazorpayWebhookController {
  constructor(private readonly employersService: EmployersService) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers("x-razorpay-signature") signature?: string,
    @Headers("x-razorpay-event-id") eventId?: string,
  ) {
    return this.employersService.handleRazorpayWebhook(
      request.rawBody,
      signature,
      eventId,
      request.body as Record<string, unknown>,
    );
  }
}
