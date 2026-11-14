import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DataSource, Repository } from "typeorm";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { RazorpayConfigurationService } from "../payments/razorpay-configuration.service";
import { CandidateProfile } from "./candidate-profile.entity";
import {
  CandidatePremiumFulfillmentStatus,
  CandidatePremiumOrder,
} from "./candidate-premium-order.entity";
import { CandidatePremiumProduct } from "./candidate-premium-product.entity";
import {
  UpdateCandidatePremiumFulfillmentDto,
  CreateCandidatePremiumProductDto,
  UpdateCandidatePremiumProductDto,
  VerifyCandidatePremiumPaymentDto,
} from "./dto/candidate-premium.dto";

type JsonObject = Record<string, unknown>;

@Injectable()
export class CandidatePremiumService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CandidatePremiumProduct)
    private readonly products: Repository<CandidatePremiumProduct>,
    @InjectRepository(CandidatePremiumOrder)
    private readonly orders: Repository<CandidatePremiumOrder>,
    @InjectRepository(CandidateProfile)
    private readonly profiles: Repository<CandidateProfile>,
    private readonly audit: AuditService,
    private readonly razorpayConfiguration: RazorpayConfigurationService,
  ) {}

  async candidateSummary(user: AuthenticatedUser) {
    const [products, orders, profile, configuration] = await Promise.all([
      this.products.find({
        where: { enabled: true },
        order: { id: "ASC" },
      }),
      this.orders.find({
        where: { userId: user.id },
        order: { createdAt: "DESC" },
        take: 20,
      }),
      this.profiles.findOneBy({ userId: user.id }),
      this.razorpayConfiguration.adminView(),
    ]);
    return {
      currency: "INR",
      checkoutReady: Boolean(
        configuration.enabled &&
          configuration.apiSecretConfigured &&
          Boolean(configuration.keyId),
      ),
      premiumBoostUntil: profile?.premiumBoostUntil ?? null,
      products: products.map((product) => this.publicProduct(product)),
      orders: orders.map((order) => this.publicOrder(order)),
    };
  }

  async createCheckout(user: AuthenticatedUser, productKey: string) {
    const product = await this.products.findOneBy({
      key: productKey,
      enabled: true,
    });
    if (!product) throw new NotFoundException("This service is not available.");
    if (
      product.key === "profile-boost" &&
      !(await this.profiles.findOneBy({ userId: user.id }))
    )
      throw new BadRequestException(
        "Complete your candidate profile before purchasing a profile boost.",
      );
    const credentials = await this.razorpayConfiguration.credentials();
    if (
      !credentials.enabled ||
      !credentials.keyId ||
      !credentials.apiSecret
    )
      throw new ServiceUnavailableException(
        "Candidate checkout is disabled or not configured. Please contact support.",
      );

    const receipt = `cp_${user.id}_${randomBytes(8).toString("hex")}`;
    const response = await this.razorpayRequest("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: product.amountPaise,
        currency: "INR",
        receipt,
        notes: { userId: String(user.id), productKey: product.key },
      }),
    });
    const payload = await this.readProviderResponse(response);
    if (
      typeof payload.id !== "string" ||
      payload.amount !== product.amountPaise ||
      payload.currency !== "INR"
    )
      throw new ServiceUnavailableException(
        "Razorpay returned an invalid order response.",
      );

    const order = await this.orders.save(
      this.orders.create({
        razorpayOrderId: payload.id,
        razorpayPaymentId: null,
        userId: user.id,
        productKey: product.key,
        productName: product.name,
        productDescription: product.description,
        amountPaise: product.amountPaise,
        fulfillmentDays: product.fulfillmentDays,
        currency: "INR",
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
        fulfillmentNote: null,
        paidAt: null,
        fulfilledAt: null,
      }),
    );
    await this.audit.record({
      actorUserId: user.id,
      action: "candidate.premium_checkout_started",
      targetType: "candidate_premium_order",
      targetId: order.id,
      details: { productKey: product.key, amountPaise: product.amountPaise },
    });
    return {
      keyId: credentials.keyId,
      orderId: payload.id,
      amount: product.amountPaise,
      currency: "INR",
      name: "esllp",
      description: product.name,
      prefill: { email: user.email, name: user.displayName },
      theme: { color: "#176b4b" },
    };
  }

  async verifyPayment(
    user: AuthenticatedUser,
    dto: VerifyCandidatePremiumPaymentDto,
  ) {
    const { apiSecret: secret } =
      await this.razorpayConfiguration.credentials();
    if (!secret)
      throw new ServiceUnavailableException(
        "Candidate payments are not configured.",
      );
    const expected = createHmac("sha256", secret)
      .update(`${dto.orderId}|${dto.paymentId}`)
      .digest();
    const received = /^[a-f0-9]{64}$/i.test(dto.signature)
      ? Buffer.from(dto.signature, "hex")
      : Buffer.alloc(0);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(expected, received)
    )
      throw new BadRequestException("The payment signature is invalid.");

    const order = await this.orders.findOneBy({
      razorpayOrderId: dto.orderId,
      userId: user.id,
    });
    if (!order) throw new NotFoundException("Payment order was not found.");
    if (order.paymentStatus === "paid") {
      if (order.razorpayPaymentId !== dto.paymentId)
        throw new ConflictException(
          "This order was verified with another payment.",
        );
      return this.publicOrder(order);
    }

    let paymentResponse = await this.razorpayRequest(
      `/payments/${encodeURIComponent(dto.paymentId)}`,
      { method: "GET" },
    );
    let payment = await this.readProviderResponse(paymentResponse);
    if (
      payment.order_id === order.razorpayOrderId &&
      payment.status === "authorized" &&
      payment.amount === order.amountPaise &&
      payment.currency === order.currency
    ) {
      paymentResponse = await this.razorpayRequest(
        `/payments/${encodeURIComponent(dto.paymentId)}/capture`,
        {
          method: "POST",
          body: JSON.stringify({
            amount: order.amountPaise,
            currency: order.currency,
          }),
        },
      );
      payment = await this.readProviderResponse(paymentResponse);
    }
    if (
      payment.order_id !== order.razorpayOrderId ||
      payment.status !== "captured" ||
      payment.amount !== order.amountPaise ||
      payment.currency !== order.currency
    )
      throw new BadRequestException(
        "Razorpay has not confirmed the expected captured payment.",
      );

    const result = await this.markPaid(order.id, user.id, dto.paymentId);
    return this.publicOrder(result.order);
  }

  async handleRazorpayWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    body: Record<string, unknown>,
  ) {
    const { webhookSecret: secret } =
      await this.razorpayConfiguration.credentials();
    if (!secret)
      throw new ServiceUnavailableException(
        "Razorpay webhook verification is not configured.",
      );
    if (!rawBody || !signature || !/^[a-f0-9]{64}$/i.test(signature))
      throw new UnauthorizedException(
        "The Razorpay webhook signature is invalid.",
      );
    const expected = createHmac("sha256", secret).update(rawBody).digest();
    const received = Buffer.from(signature, "hex");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(expected, received)
    )
      throw new UnauthorizedException(
        "The Razorpay webhook signature is invalid.",
      );

    if (body.event !== "payment.captured") return { received: true };
    const eventPayload = body.payload;
    const paymentEnvelope =
      typeof eventPayload === "object" && eventPayload !== null
        ? (eventPayload as JsonObject).payment
        : null;
    const payment =
      typeof paymentEnvelope === "object" && paymentEnvelope !== null
        ? (paymentEnvelope as JsonObject).entity
        : null;
    if (typeof payment !== "object" || payment === null)
      throw new BadRequestException("The Razorpay payment event is malformed.");
    const paymentEntity = payment as JsonObject;
    if (
      typeof paymentEntity.id !== "string" ||
      typeof paymentEntity.order_id !== "string"
    )
      throw new BadRequestException("The Razorpay payment event is malformed.");
    const order = await this.orders.findOneBy({
      razorpayOrderId: paymentEntity.order_id,
    });
    if (!order) return { received: true };
    if (
      paymentEntity.status !== "captured" ||
      paymentEntity.amount !== order.amountPaise ||
      paymentEntity.currency !== order.currency
    )
      throw new BadRequestException(
        "The Razorpay event does not match the candidate order.",
      );
    const result = await this.markPaid(
      order.id,
      order.userId,
      paymentEntity.id,
    );
    return { received: true, order: this.publicOrder(result.order) };
  }

  async adminProducts() {
    return (await this.products.find({ order: { id: "ASC" } })).map((product) =>
      this.publicProduct(product),
    );
  }

  async createProduct(
    dto: CreateCandidatePremiumProductDto,
    actor: AuthenticatedUser,
  ) {
    const key = dto.key.trim();
    if (await this.products.findOneBy({ key }))
      throw new ConflictException(
        "A candidate service with this key already exists.",
      );
    if (dto.fulfillmentDays && key !== "profile-boost")
      throw new BadRequestException(
        "Fulfillment days can only be set for profile boosts.",
      );
    const product = this.products.create({
      key,
      name: dto.name.trim(),
      description: dto.description.trim(),
      amountPaise: Math.round(dto.amountInr * 100),
      fulfillmentDays: dto.fulfillmentDays ?? 0,
      enabled: dto.enabled ?? true,
    });
    const saved = await this.products.save(product);
    await this.audit.record({
      actorUserId: actor.id,
      action: "admin.candidate_premium_product_created",
      targetType: "candidate_premium_product",
      targetId: saved.key,
      details: {
        amountPaise: saved.amountPaise,
        enabled: saved.enabled,
        fulfillmentDays: saved.fulfillmentDays,
      },
    });
    return this.publicProduct(saved);
  }

  async updateProduct(
    key: string,
    dto: UpdateCandidatePremiumProductDto,
    actor: AuthenticatedUser,
  ) {
    const product = await this.products.findOneBy({ key });
    if (!product) throw new NotFoundException("Premium service was not found.");
    if (
      key === "profile-boost" &&
      dto.fulfillmentDays !== undefined &&
      dto.fulfillmentDays < 1
    )
      throw new BadRequestException(
        "A profile boost must last at least one day.",
      );
    if (
      key !== "profile-boost" &&
      dto.fulfillmentDays !== undefined &&
      dto.fulfillmentDays !== 0
    )
      throw new BadRequestException(
        "Fulfillment days can only be set for profile boosts.",
      );
    if (dto.name !== undefined) product.name = dto.name.trim();
    product.amountPaise = Math.round(dto.amountInr * 100);
    if (dto.fulfillmentDays !== undefined)
      product.fulfillmentDays = dto.fulfillmentDays;
    if (dto.enabled !== undefined) product.enabled = dto.enabled;
    if (dto.description !== undefined)
      product.description = dto.description.trim();
    const saved = await this.products.save(product);
    await this.audit.record({
      actorUserId: actor.id,
      action: "admin.candidate_premium_product_updated",
      targetType: "candidate_premium_product",
      targetId: saved.key,
      details: {
        name: saved.name,
        amountPaise: saved.amountPaise,
        enabled: saved.enabled,
        fulfillmentDays: saved.fulfillmentDays,
      },
    });
    return this.publicProduct(saved);
  }

  async disableProduct(
    key: string,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    const product = await this.products.findOneBy({ key });
    if (!product) throw new NotFoundException("Premium service was not found.");
    if (!product.enabled) return this.publicProduct(product);
    product.enabled = false;
    const saved = await this.products.save(product);
    await this.audit.record({
      actorUserId: actor.id,
      action: "admin.candidate_premium_product_disabled",
      targetType: "candidate_premium_product",
      targetId: saved.key,
      details: { reason: reason.trim() },
    });
    return this.publicProduct(saved);
  }

  async adminOrders() {
    const orders = await this.orders.find({
      relations: { user: true },
      order: { createdAt: "DESC", id: "DESC" },
      take: 200,
    });
    return orders.map((order) => ({
      ...this.publicOrder(order),
      candidateName: order.user.displayName,
      candidateEmail: order.user.email,
      candidateId: order.userId,
    }));
  }

  async adminRevenue() {
    const paidCondition =
      "order.paymentStatus = 'paid' AND order.paidAt IS NOT NULL";
    const monthExpression =
      "to_char(date_trunc('month', order.paidAt AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM')";
    const totalsQuery = this.orders
      .createQueryBuilder("order")
      .select(
        `COUNT(*) FILTER (WHERE ${paidCondition})::text`,
        "paidOrders",
      )
      .addSelect(
        `ROUND(COALESCE(SUM(order.amountPaise) FILTER (WHERE ${paidCondition}), 0)::numeric / 100, 2)::text`,
        "grossPaidInr",
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE order.paymentStatus = 'pending')::text",
        "pendingOrders",
      );
    const productsQuery = this.orders
      .createQueryBuilder("order")
      .select("order.productKey", "productKey")
      .addSelect("order.productName", "productName")
      .addSelect("COUNT(*)::text", "paidOrders")
      .addSelect(
        "ROUND(COALESCE(SUM(order.amountPaise), 0)::numeric / 100, 2)::text",
        "grossPaidInr",
      )
      .where(paidCondition)
      .groupBy("order.productKey")
      .addGroupBy("order.productName")
      .orderBy("order.productName", "ASC");
    const monthlyQuery = this.orders
      .createQueryBuilder("order")
      .select(monthExpression, "month")
      .addSelect("COUNT(*)::text", "paidOrders")
      .addSelect(
        "ROUND(COALESCE(SUM(order.amountPaise), 0)::numeric / 100, 2)::text",
        "grossPaidInr",
      )
      .where(paidCondition)
      .andWhere(
        "order.paidAt >= ((date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') - INTERVAL '11 months') AT TIME ZONE 'Asia/Kolkata')",
      )
      .groupBy(monthExpression)
      .orderBy(monthExpression, "ASC");

    const [totals, products, monthly] = await Promise.all([
      totalsQuery.getRawOne<{
        paidOrders?: string;
        pendingOrders?: string;
        grossPaidInr?: string;
      }>(),
      productsQuery.getRawMany<{
        productKey: string;
        productName: string;
        paidOrders: string;
        grossPaidInr: string;
      }>(),
      monthlyQuery.getRawMany<{
        month: string;
        paidOrders: string;
        grossPaidInr: string;
      }>(),
    ]);

    const indiaParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const currentYear = Number(
      indiaParts.find((part) => part.type === "year")?.value,
    );
    const currentMonth =
      Number(indiaParts.find((part) => part.type === "month")?.value) - 1;
    const currentMonthIndex = currentYear * 12 + currentMonth;
    const monthlyByMonth = new Map(
      monthly.map((row) => [row.month, row]),
    );

    return {
      currency: "INR",
      scope: "candidate_service_payments",
      totals: {
        paidOrders: totals?.paidOrders ?? "0",
        pendingOrders: totals?.pendingOrders ?? "0",
        grossPaidInr: totals?.grossPaidInr ?? "0",
      },
      byProduct: products,
      monthly: Array.from({ length: 12 }, (_, index) => {
        const monthIndex = currentMonthIndex - 11 + index;
        const year = Math.floor(monthIndex / 12);
        const month = String((monthIndex % 12) + 1).padStart(2, "0");
        const key = `${year}-${month}`;
        const row = monthlyByMonth.get(key);
        return {
          month: key,
          paidOrders: row?.paidOrders ?? "0",
          grossPaidInr: row?.grossPaidInr ?? "0",
        };
      }),
    };
  }

  async updateFulfillment(
    orderId: number,
    dto: UpdateCandidatePremiumFulfillmentDto,
    actor: AuthenticatedUser,
  ) {
    const order = await this.orders.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException("Premium order was not found.");
    if (order.paymentStatus !== "paid")
      throw new BadRequestException("Only paid orders can be fulfilled.");
    if (order.productKey === "profile-boost")
      throw new BadRequestException(
        "Profile boosts are activated automatically after payment.",
      );
    if (
      ["completed", "cancelled"].includes(order.fulfillmentStatus) &&
      order.fulfillmentStatus !== dto.status
    )
      throw new ConflictException("A completed fulfillment cannot be changed.");
    if (order.fulfillmentStatus === "in_progress" && dto.status === "pending")
      throw new ConflictException(
        "A service in progress cannot be returned to pending.",
      );
    if (dto.status === "completed") {
      order.fulfilledAt = new Date();
    } else if (dto.status === "cancelled") {
      order.fulfilledAt = null;
    }
    order.fulfillmentStatus = dto.status as CandidatePremiumFulfillmentStatus;
    order.fulfillmentNote = dto.note?.trim() || null;
    const saved = await this.orders.save(order);
    await this.audit.record({
      actorUserId: actor.id,
      action: "admin.candidate_premium_fulfillment_updated",
      targetType: "candidate_premium_order",
      targetId: saved.id,
      details: { fulfillmentStatus: saved.fulfillmentStatus },
    });
    return this.publicOrder(saved);
  }

  private publicProduct(product: CandidatePremiumProduct) {
    return {
      key: product.key,
      name: product.name,
      description: product.description,
      amountInr: product.amountPaise / 100,
      fulfillmentDays: product.fulfillmentDays,
      enabled: product.enabled,
    };
  }

  private async markPaid(orderId: number, userId: number, paymentId: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(CandidatePremiumOrder);
      const lockedOrder = await orderRepository.findOne({
        where: { id: orderId, userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!lockedOrder)
        throw new NotFoundException("Payment order was not found.");
      if (lockedOrder.paymentStatus === "paid") {
        if (lockedOrder.razorpayPaymentId !== paymentId)
          throw new ConflictException(
            "This order was verified with another payment.",
          );
        return { order: lockedOrder, changed: false };
      }

      const product = await manager
        .getRepository(CandidatePremiumProduct)
        .findOneBy({ key: lockedOrder.productKey });
      if (!product)
        throw new NotFoundException("Purchased service was not found.");
      lockedOrder.paymentStatus = "paid";
      lockedOrder.razorpayPaymentId = paymentId;
      lockedOrder.paidAt = new Date();
      if (product.key === "profile-boost") {
        const profileRepository = manager.getRepository(CandidateProfile);
        const profile = await profileRepository.findOne({
          where: { userId },
          lock: { mode: "pessimistic_write" },
        });
        if (!profile)
          throw new BadRequestException(
            "The candidate profile is unavailable for the purchased boost.",
          );
        const now = new Date();
        const start =
          profile.premiumBoostUntil && profile.premiumBoostUntil > now
            ? profile.premiumBoostUntil
            : now;
        profile.premiumBoostUntil = new Date(
          start.getTime() + lockedOrder.fulfillmentDays * 24 * 60 * 60 * 1000,
        );
        await profileRepository.save(profile);
        lockedOrder.fulfillmentStatus = "completed";
        lockedOrder.fulfilledAt = now;
        lockedOrder.fulfillmentNote = "Profile boost activated automatically.";
      }
      return {
        order: await orderRepository.save(lockedOrder),
        changed: true,
      };
    });
    if (result.changed)
      await this.audit.record({
        actorUserId: userId,
        action: "candidate.premium_payment_verified",
        targetType: "candidate_premium_order",
        targetId: result.order.id,
        details: {
          productKey: result.order.productKey,
          amountPaise: result.order.amountPaise,
        },
      });
    return result;
  }

  private publicOrder(order: CandidatePremiumOrder) {
    return {
      id: order.id,
      productKey: order.productKey,
      productName: order.productName,
      productDescription: order.productDescription,
      amountInr: order.amountPaise / 100,
      fulfillmentDays: order.fulfillmentDays,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      fulfillmentNote: order.fulfillmentNote,
      paidAt: order.paidAt,
      fulfilledAt: order.fulfilledAt,
      createdAt: order.createdAt,
    };
  }

  private async razorpayRequest(
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const credentials =
      await this.razorpayConfiguration.credentials();
    if (!credentials.keyId || !credentials.apiSecret)
      throw new ServiceUnavailableException("Razorpay is not configured.");
    return fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.apiSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
  }

  private async readProviderResponse(response: Response): Promise<JsonObject> {
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok)
      throw new ServiceUnavailableException(
        `Razorpay request failed (HTTP ${response.status}).`,
      );
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    )
      throw new ServiceUnavailableException(
        "Razorpay returned an invalid response.",
      );
    return payload as JsonObject;
  }
}
