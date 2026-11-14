import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import {
  decryptConfigSecret,
  encryptConfigSecret,
  getConfigSecretKey,
} from "../common/encrypted-config-secret";
import { UpdateTwilioConfigurationDto } from "./dto/update-twilio-configuration.dto";
import { TwilioConfiguration } from "./twilio-configuration.entity";

export type TwilioCredentials = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

export type TwilioWhatsAppCredentials = {
  accountSid: string;
  authToken: string;
  from: string;
  templateSid: string;
};

@Injectable()
export class TwilioConfigurationService {
  constructor(
    @InjectRepository(TwilioConfiguration)
    private readonly configurations: Repository<TwilioConfiguration>,
    private readonly audit: AuditService,
  ) {}

  async adminView() {
    const configuration = await this.findConfiguration();
    const accountSid =
      configuration?.accountSid?.trim() ||
      process.env.TWILIO_ACCOUNT_SID?.trim() ||
      "";
    const fromNumber =
      configuration?.fromNumber?.trim() ||
      process.env.TWILIO_FROM_NUMBER?.trim() ||
      "";
    const authTokenConfigured = Boolean(
      configuration?.authTokenEncrypted ||
      process.env.TWILIO_AUTH_TOKEN?.trim(),
    );
    const whatsappFrom =
      configuration?.whatsappFrom?.trim() ||
      process.env.TWILIO_WHATSAPP_FROM?.trim() ||
      "";
    const whatsappTemplateSid =
      configuration?.whatsappTemplateSid?.trim() ||
      process.env.TWILIO_WHATSAPP_TEMPLATE_SID?.trim() ||
      "";
    const whatsappEnabled = configuration?.whatsappEnabled ?? false;
    const enabled =
      configuration?.enabled ??
      Boolean(
        accountSid && fromNumber && process.env.TWILIO_AUTH_TOKEN?.trim(),
      );
    return {
      enabled,
      accountSid,
      fromNumber,
      authTokenConfigured,
      encryptionReady: Boolean(
        this.encryptionKey(process.env.TWILIO_CONFIG_ENCRYPTION_KEY),
      ),
      ready:
        enabled && Boolean(accountSid && fromNumber && authTokenConfigured),
      whatsappEnabled,
      whatsappFrom,
      whatsappTemplateSid,
      whatsappReady:
        whatsappEnabled &&
        Boolean(
          accountSid &&
          authTokenConfigured &&
          /^whatsapp:\+\d{7,15}$/.test(whatsappFrom) &&
          /^HX[a-fA-F0-9]{32}$/.test(whatsappTemplateSid),
        ),
      updatedAt: configuration?.updatedAt ?? null,
    };
  }

  async credentials(): Promise<TwilioCredentials> {
    const configuration = await this.findConfiguration();
    const accountSid =
      configuration?.accountSid?.trim() ||
      process.env.TWILIO_ACCOUNT_SID?.trim() ||
      "";
    const fromNumber =
      configuration?.fromNumber?.trim() ||
      process.env.TWILIO_FROM_NUMBER?.trim() ||
      "";
    const authToken =
      (configuration?.authTokenEncrypted
        ? this.decrypt(configuration.authTokenEncrypted)
        : null) ||
      process.env.TWILIO_AUTH_TOKEN?.trim() ||
      "";
    const enabled =
      configuration?.enabled ?? Boolean(accountSid && fromNumber && authToken);
    if (!enabled || !accountSid || !authToken || !fromNumber)
      throw new ServiceUnavailableException(
        "SMS verification is not configured. Configure and enable Twilio before registering.",
      );
    return { accountSid, authToken, fromNumber };
  }

  async whatsappCredentials(): Promise<TwilioWhatsAppCredentials> {
    const configuration = await this.findConfiguration();
    const accountSid =
      configuration?.accountSid?.trim() ||
      process.env.TWILIO_ACCOUNT_SID?.trim() ||
      "";
    const authToken =
      (configuration?.authTokenEncrypted
        ? this.decrypt(configuration.authTokenEncrypted)
        : null) ||
      process.env.TWILIO_AUTH_TOKEN?.trim() ||
      "";
    const from =
      configuration?.whatsappFrom?.trim() ||
      process.env.TWILIO_WHATSAPP_FROM?.trim() ||
      "";
    const templateSid =
      configuration?.whatsappTemplateSid?.trim() ||
      process.env.TWILIO_WHATSAPP_TEMPLATE_SID?.trim() ||
      "";
    if (
      !configuration?.whatsappEnabled ||
      !accountSid ||
      !authToken ||
      !/^whatsapp:\+\d{7,15}$/.test(from) ||
      !/^HX[a-fA-F0-9]{32}$/.test(templateSid)
    )
      throw new ServiceUnavailableException(
        "WhatsApp interview reminders are disabled or incomplete.",
      );
    return { accountSid, authToken, from, templateSid };
  }

  async update(dto: UpdateTwilioConfigurationDto, actor: AuthenticatedUser) {
    const newAuthToken = dto.authToken?.trim();
    if (newAuthToken && dto.clearAuthToken)
      throw new BadRequestException(
        "Provide a new Twilio auth token or clear the saved token, not both.",
      );
    if (
      newAuthToken &&
      !this.encryptionKey(process.env.TWILIO_CONFIG_ENCRYPTION_KEY)
    )
      throw new ServiceUnavailableException(
        "Set TWILIO_CONFIG_ENCRYPTION_KEY on the server before saving Twilio credentials.",
      );

    const configuration =
      (await this.configurations.findOneBy({ id: 1 })) ??
      this.configurations.create({
        id: 1,
        enabled: false,
        accountSid: null,
        authTokenEncrypted: null,
        fromNumber: null,
        whatsappEnabled: false,
        whatsappFrom: null,
        whatsappTemplateSid: null,
      });
    configuration.enabled = dto.enabled;
    if (dto.accountSid !== undefined)
      configuration.accountSid = dto.accountSid.trim() || null;
    if (dto.fromNumber !== undefined)
      configuration.fromNumber = dto.fromNumber.trim() || null;
    if (dto.whatsappEnabled !== undefined)
      configuration.whatsappEnabled = dto.whatsappEnabled;
    if (dto.whatsappFrom !== undefined)
      configuration.whatsappFrom = dto.whatsappFrom.trim() || null;
    if (dto.whatsappTemplateSid !== undefined)
      configuration.whatsappTemplateSid =
        dto.whatsappTemplateSid.trim() || null;
    if (newAuthToken)
      configuration.authTokenEncrypted = this.encrypt(newAuthToken);
    else if (dto.clearAuthToken) configuration.authTokenEncrypted = null;

    await this.configurations.save(configuration);
    await this.audit.record({
      actorUserId: actor.id,
      action: "admin.twilio_configuration_updated",
      targetType: "twilio_configuration",
      targetId: 1,
      details: {
        reason: dto.reason.trim(),
        enabled: configuration.enabled,
        accountSidChanged: dto.accountSid !== undefined,
        fromNumberChanged: dto.fromNumber !== undefined,
        whatsappEnabled: configuration.whatsappEnabled,
        whatsappFromChanged: dto.whatsappFrom !== undefined,
        whatsappTemplateSidChanged: dto.whatsappTemplateSid !== undefined,
        authTokenChanged: Boolean(newAuthToken || dto.clearAuthToken),
      },
    });
    return this.adminView();
  }

  private async findConfiguration() {
    return this.configurations.findOne({
      where: { id: 1 },
      select: {
        id: true,
        enabled: true,
        accountSid: true,
        authTokenEncrypted: true,
        fromNumber: true,
        whatsappEnabled: true,
        whatsappFrom: true,
        whatsappTemplateSid: true,
        updatedAt: true,
      },
    });
  }

  private encryptionKey(configured: string | undefined) {
    return getConfigSecretKey(configured);
  }

  private encrypt(value: string) {
    const key = this.encryptionKey(process.env.TWILIO_CONFIG_ENCRYPTION_KEY);
    if (!key)
      throw new ServiceUnavailableException(
        "TWILIO_CONFIG_ENCRYPTION_KEY is required to save Twilio credentials.",
      );
    return encryptConfigSecret(value, key);
  }

  private decrypt(value: string) {
    const key = this.encryptionKey(process.env.TWILIO_CONFIG_ENCRYPTION_KEY);
    if (!key)
      throw new ServiceUnavailableException(
        "TWILIO_CONFIG_ENCRYPTION_KEY is required to read saved Twilio credentials.",
      );
    try {
      return decryptConfigSecret(value, key);
    } catch (error) {
      throw new ServiceUnavailableException(
        "Twilio credential decryption failed; verify TWILIO_CONFIG_ENCRYPTION_KEY.",
        { cause: error },
      );
    }
  }
}
