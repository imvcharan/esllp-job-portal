import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import {
  decryptConfigSecret,
  encryptConfigSecret,
  getConfigSecretKey,
} from "../common/encrypted-config-secret";
import { UpdateRazorpayConfigurationDto } from "./dto/update-razorpay-configuration.dto";
import { RazorpayConfiguration } from "./razorpay-configuration.entity";

export type RazorpayCredentials = {
  keyId: string;
  apiSecret: string;
  webhookSecret: string | null;
  enabled: boolean;
};

@Injectable()
export class RazorpayConfigurationService {
  constructor(
    @InjectRepository(RazorpayConfiguration)
    private readonly configurations: Repository<RazorpayConfiguration>,
    private readonly audit: AuditService,
  ) {}

  async adminView() {
    const configuration = await this.configurations.findOne({
      where: { id: 1 },
      select: {
        id: true,
        keyId: true,
        enabled: true,
        apiSecretEncrypted: true,
        webhookSecretEncrypted: true,
        starterPlanId: true,
        starterAmountPaise: true,
        growthPlanId: true,
        growthAmountPaise: true,
        businessPlanId: true,
        businessAmountPaise: true,
        enterprisePlanId: true,
        enterpriseAmountPaise: true,
        starterActiveJobs: true,
        starterSeats: true,
        starterResumeCredits: true,
        growthActiveJobs: true,
        growthSeats: true,
        growthResumeCredits: true,
        businessActiveJobs: true,
        businessSeats: true,
        businessResumeCredits: true,
        enterpriseActiveJobs: true,
        enterpriseSeats: true,
        enterpriseResumeCredits: true,
        updatedAt: true,
      },
    });
    return {
      encryptionReady: Boolean(this.encryptionKey()),
      enabled:
        configuration?.enabled ??
        Boolean(
          (configuration?.keyId || process.env.RAZORPAY_KEY_ID?.trim()) &&
          (configuration?.apiSecretEncrypted ||
            process.env.RAZORPAY_KEY_SECRET?.trim()),
        ),
      keyId: configuration?.keyId ?? process.env.RAZORPAY_KEY_ID?.trim() ?? "",
      apiSecretConfigured: Boolean(
        configuration?.apiSecretEncrypted ||
        process.env.RAZORPAY_KEY_SECRET?.trim(),
      ),
      webhookSecretConfigured: Boolean(
        configuration?.webhookSecretEncrypted ||
        process.env.RAZORPAY_WEBHOOK_SECRET?.trim(),
      ),
      starterPlanId:
        configuration?.starterPlanId ??
        process.env.RAZORPAY_PLAN_STARTER?.trim() ??
        "",
      starterAmountInr:
        configuration?.starterAmountPaise !== null &&
        configuration?.starterAmountPaise !== undefined
          ? configuration.starterAmountPaise / 100
          : (this.environmentAmount("EMPLOYER_STARTER_PRICE_INR") ?? 2999),
      starterActiveJobs: configuration?.starterActiveJobs ?? 5,
      starterSeats: configuration?.starterSeats ?? 3,
      starterResumeCredits: configuration?.starterResumeCredits ?? 0,
      growthPlanId:
        configuration?.growthPlanId ??
        process.env.RAZORPAY_PLAN_GROWTH?.trim() ??
        "",
      growthAmountInr:
        configuration?.growthAmountPaise !== null &&
        configuration?.growthAmountPaise !== undefined
          ? configuration.growthAmountPaise / 100
          : (this.environmentAmount("EMPLOYER_GROWTH_PRICE_INR") ?? 9999),
      growthActiveJobs: configuration?.growthActiveJobs ?? 25,
      growthSeats: configuration?.growthSeats ?? 10,
      growthResumeCredits: configuration?.growthResumeCredits ?? 25,
      businessPlanId:
        configuration?.businessPlanId ??
        process.env.RAZORPAY_PLAN_BUSINESS?.trim() ??
        "",
      businessAmountInr:
        configuration?.businessAmountPaise !== null &&
        configuration?.businessAmountPaise !== undefined
          ? configuration.businessAmountPaise / 100
          : (this.environmentAmount("EMPLOYER_BUSINESS_PRICE_INR") ?? 24999),
      businessActiveJobs: configuration?.businessActiveJobs ?? 75,
      businessSeats: configuration?.businessSeats ?? 25,
      businessResumeCredits: configuration?.businessResumeCredits ?? 100,
      enterprisePlanId:
        configuration?.enterprisePlanId ??
        process.env.RAZORPAY_PLAN_ENTERPRISE?.trim() ??
        "",
      enterpriseAmountInr:
        configuration?.enterpriseAmountPaise !== null &&
        configuration?.enterpriseAmountPaise !== undefined
          ? configuration.enterpriseAmountPaise / 100
          : this.environmentAmount("EMPLOYER_ENTERPRISE_PRICE_INR"),
      enterpriseActiveJobs: configuration?.enterpriseActiveJobs ?? 1000,
      enterpriseSeats: configuration?.enterpriseSeats ?? 100,
      enterpriseResumeCredits: configuration?.enterpriseResumeCredits ?? 500,
      candidateWebhookPath: "/api/billing/razorpay/candidate-webhook",
      employerWebhookPath: "/api/billing/razorpay/webhook",
    };
  }

  async credentials(): Promise<RazorpayCredentials> {
    const configuration = await this.configurations.findOne({
      where: { id: 1 },
      select: {
        id: true,
        keyId: true,
        enabled: true,
        apiSecretEncrypted: true,
        webhookSecretEncrypted: true,
        starterPlanId: true,
        starterAmountPaise: true,
        growthPlanId: true,
        growthAmountPaise: true,
        businessPlanId: true,
        businessAmountPaise: true,
        enterprisePlanId: true,
        enterpriseAmountPaise: true,
        starterActiveJobs: true,
        starterSeats: true,
        starterResumeCredits: true,
        growthActiveJobs: true,
        growthSeats: true,
        growthResumeCredits: true,
        businessActiveJobs: true,
        businessSeats: true,
        businessResumeCredits: true,
        enterpriseActiveJobs: true,
        enterpriseSeats: true,
        enterpriseResumeCredits: true,
        updatedAt: true,
      },
    });
    const keyId =
      configuration?.keyId?.trim() || process.env.RAZORPAY_KEY_ID?.trim() || "";
    const apiSecret =
      (configuration?.apiSecretEncrypted
        ? this.decrypt(configuration.apiSecretEncrypted)
        : null) ||
      process.env.RAZORPAY_KEY_SECRET?.trim() ||
      "";
    const webhookSecret =
      (configuration?.webhookSecretEncrypted
        ? this.decrypt(configuration.webhookSecretEncrypted)
        : null) ||
      process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ||
      null;
    return {
      keyId,
      apiSecret,
      webhookSecret,
      enabled: configuration?.enabled ?? Boolean(keyId && apiSecret),
    };
  }

  async employerPlans() {
    const configuration = await this.configurations.findOneBy({ id: 1 });
    return {
      starter: {
        planId:
          configuration?.starterPlanId ??
          process.env.RAZORPAY_PLAN_STARTER?.trim() ??
          null,
        amountInr:
          configuration?.starterAmountPaise !== null &&
          configuration?.starterAmountPaise !== undefined
            ? configuration.starterAmountPaise / 100
            : (this.environmentAmount("EMPLOYER_STARTER_PRICE_INR") ?? 2999),
        activeJobs: configuration?.starterActiveJobs ?? 5,
        seats: configuration?.starterSeats ?? 3,
        resumeCredits: configuration?.starterResumeCredits ?? 0,
      },
      growth: {
        planId:
          configuration?.growthPlanId ??
          process.env.RAZORPAY_PLAN_GROWTH?.trim() ??
          null,
        amountInr:
          configuration?.growthAmountPaise !== null &&
          configuration?.growthAmountPaise !== undefined
            ? configuration.growthAmountPaise / 100
            : this.environmentAmount("EMPLOYER_GROWTH_PRICE_INR"),
        activeJobs: configuration?.growthActiveJobs ?? 25,
        seats: configuration?.growthSeats ?? 10,
        resumeCredits: configuration?.growthResumeCredits ?? 25,
      },
      business: {
        planId:
          configuration?.businessPlanId ??
          process.env.RAZORPAY_PLAN_BUSINESS?.trim() ??
          null,
        amountInr:
          configuration?.businessAmountPaise !== null &&
          configuration?.businessAmountPaise !== undefined
            ? configuration.businessAmountPaise / 100
            : (this.environmentAmount("EMPLOYER_BUSINESS_PRICE_INR") ?? 24999),
        activeJobs: configuration?.businessActiveJobs ?? 75,
        seats: configuration?.businessSeats ?? 25,
        resumeCredits: configuration?.businessResumeCredits ?? 100,
      },
      enterprise: {
        planId:
          configuration?.enterprisePlanId ??
          process.env.RAZORPAY_PLAN_ENTERPRISE?.trim() ??
          null,
        amountInr:
          configuration?.enterpriseAmountPaise !== null &&
          configuration?.enterpriseAmountPaise !== undefined
            ? configuration.enterpriseAmountPaise / 100
            : this.environmentAmount("EMPLOYER_ENTERPRISE_PRICE_INR"),
        activeJobs: configuration?.enterpriseActiveJobs ?? 1000,
        seats: configuration?.enterpriseSeats ?? 100,
        resumeCredits: configuration?.enterpriseResumeCredits ?? 500,
      },
    };
  }

  async update(dto: UpdateRazorpayConfigurationDto, actor: AuthenticatedUser) {
    if (
      (dto.apiSecret !== undefined || dto.webhookSecret !== undefined) &&
      !this.encryptionKey()
    )
      throw new ServiceUnavailableException(
        "Set RAZORPAY_CONFIG_ENCRYPTION_KEY on the server before saving Razorpay secrets.",
      );

    const configuration =
      (await this.configurations.findOneBy({ id: 1 })) ??
      this.configurations.create({
        id: 1,
        keyId: null,
        enabled: false,
        apiSecretEncrypted: null,
        webhookSecretEncrypted: null,
        starterPlanId: null,
        starterAmountPaise: null,
        growthPlanId: null,
        growthAmountPaise: null,
        businessPlanId: null,
        businessAmountPaise: null,
        enterprisePlanId: null,
        enterpriseAmountPaise: null,
        starterActiveJobs: 5,
        starterSeats: 3,
        starterResumeCredits: 0,
        growthActiveJobs: 25,
        growthSeats: 10,
        growthResumeCredits: 25,
        businessActiveJobs: 75,
        businessSeats: 25,
        businessResumeCredits: 100,
        enterpriseActiveJobs: 1000,
        enterpriseSeats: 100,
        enterpriseResumeCredits: 500,
      });

    if (dto.keyId !== undefined)
      configuration.keyId = dto.keyId?.trim() || null;
    if (dto.enabled !== undefined) configuration.enabled = dto.enabled;
    if (dto.apiSecret?.trim())
      configuration.apiSecretEncrypted = this.encrypt(dto.apiSecret.trim());
    if (dto.webhookSecret?.trim())
      configuration.webhookSecretEncrypted = this.encrypt(
        dto.webhookSecret.trim(),
      );
    if (dto.starterPlanId !== undefined)
      configuration.starterPlanId = dto.starterPlanId?.trim() || null;
    if (dto.starterAmountInr !== undefined)
      configuration.starterAmountPaise =
        dto.starterAmountInr === null
          ? null
          : Math.round(dto.starterAmountInr * 100);
    if (dto.growthPlanId !== undefined)
      configuration.growthPlanId = dto.growthPlanId?.trim() || null;
    if (dto.growthAmountInr !== undefined)
      configuration.growthAmountPaise =
        dto.growthAmountInr === null
          ? null
          : Math.round(dto.growthAmountInr * 100);
    if (dto.businessPlanId !== undefined)
      configuration.businessPlanId = dto.businessPlanId?.trim() || null;
    if (dto.businessAmountInr !== undefined)
      configuration.businessAmountPaise =
        dto.businessAmountInr === null
          ? null
          : Math.round(dto.businessAmountInr * 100);
    if (dto.enterprisePlanId !== undefined)
      configuration.enterprisePlanId = dto.enterprisePlanId?.trim() || null;
    if (dto.enterpriseAmountInr !== undefined)
      configuration.enterpriseAmountPaise =
        dto.enterpriseAmountInr === null
          ? null
          : Math.round(dto.enterpriseAmountInr * 100);
    if (dto.starterActiveJobs !== undefined)
      configuration.starterActiveJobs = dto.starterActiveJobs;
    if (dto.starterSeats !== undefined)
      configuration.starterSeats = dto.starterSeats;
    if (dto.starterResumeCredits !== undefined)
      configuration.starterResumeCredits = dto.starterResumeCredits;
    if (dto.growthActiveJobs !== undefined)
      configuration.growthActiveJobs = dto.growthActiveJobs;
    if (dto.growthSeats !== undefined)
      configuration.growthSeats = dto.growthSeats;
    if (dto.growthResumeCredits !== undefined)
      configuration.growthResumeCredits = dto.growthResumeCredits;
    if (dto.businessActiveJobs !== undefined)
      configuration.businessActiveJobs = dto.businessActiveJobs;
    if (dto.businessSeats !== undefined)
      configuration.businessSeats = dto.businessSeats;
    if (dto.businessResumeCredits !== undefined)
      configuration.businessResumeCredits = dto.businessResumeCredits;
    if (dto.enterpriseActiveJobs !== undefined)
      configuration.enterpriseActiveJobs = dto.enterpriseActiveJobs;
    if (dto.enterpriseSeats !== undefined)
      configuration.enterpriseSeats = dto.enterpriseSeats;
    if (dto.enterpriseResumeCredits !== undefined)
      configuration.enterpriseResumeCredits = dto.enterpriseResumeCredits;

    await this.configurations.save(configuration);
    await this.audit.record({
      actorUserId: actor.id,
      action: "admin.razorpay_configuration_updated",
      targetType: "razorpay_configuration",
      targetId: 1,
      details: {
        keyIdChanged: dto.keyId !== undefined,
        enabled: configuration.enabled,
        apiSecretChanged: Boolean(dto.apiSecret?.trim()),
        webhookSecretChanged: Boolean(dto.webhookSecret?.trim()),
        starterPlanChanged:
          dto.starterPlanId !== undefined || dto.starterAmountInr !== undefined,
        growthPlanChanged:
          dto.growthPlanId !== undefined || dto.growthAmountInr !== undefined,
        businessPlanChanged:
          dto.businessPlanId !== undefined ||
          dto.businessAmountInr !== undefined,
        enterprisePlanChanged:
          dto.enterprisePlanId !== undefined ||
          dto.enterpriseAmountInr !== undefined,
        entitlementsChanged: [
          dto.starterActiveJobs,
          dto.starterSeats,
          dto.growthActiveJobs,
          dto.growthSeats,
          dto.businessActiveJobs,
          dto.businessSeats,
          dto.starterResumeCredits,
          dto.growthResumeCredits,
          dto.businessResumeCredits,
          dto.enterpriseActiveJobs,
          dto.enterpriseSeats,
          dto.enterpriseResumeCredits,
        ].some((value) => value !== undefined),
      },
    });
    return this.adminView();
  }

  async testConnection() {
    const { keyId, apiSecret } = await this.credentials();
    if (!keyId || !apiSecret)
      throw new ServiceUnavailableException(
        "Configure both Razorpay key ID and API secret before testing the connection.",
      );
    const response = await fetch(
      "https://api.razorpay.com/v1/payments?count=1",
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${apiSecret}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok)
      throw new ServiceUnavailableException(
        `Razorpay rejected the configured API credentials (HTTP ${response.status}).`,
      );
    return {
      connected: true,
      mode: keyId.startsWith("rzp_test_") ? "test" : "live",
    };
  }

  private encryptionKey() {
    return getConfigSecretKey(process.env.RAZORPAY_CONFIG_ENCRYPTION_KEY);
  }

  private encrypt(value: string) {
    const key = this.encryptionKey();
    if (!key)
      throw new ServiceUnavailableException(
        "Razorpay secret encryption is not configured.",
      );
    return encryptConfigSecret(value, key);
  }

  private decrypt(value: string) {
    const key = this.encryptionKey();
    if (!key)
      throw new ServiceUnavailableException(
        "RAZORPAY_CONFIG_ENCRYPTION_KEY is required to read saved Razorpay secrets.",
      );
    try {
      return decryptConfigSecret(value, key);
    } catch (error) {
      throw new ServiceUnavailableException(
        "Razorpay secret decryption failed or the stored value has an unsupported format; verify RAZORPAY_CONFIG_ENCRYPTION_KEY.",
        { cause: error },
      );
    }
  }

  private environmentAmount(name: string) {
    const raw = process.env[name]?.trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0)
      throw new ServiceUnavailableException(
        `${name} must be a non-negative INR amount.`,
      );
    return value;
  }
}
