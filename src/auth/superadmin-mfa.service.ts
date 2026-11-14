import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { DataSource, IsNull, Repository } from "typeorm";
import {
  decryptConfigSecret,
  encryptConfigSecret,
  getConfigSecretKey,
} from "../common/encrypted-config-secret";
import {
  SuperadminMfa,
  SuperadminMfaRecoveryCode,
} from "./superadmin-mfa.entity";

const RECOVERY_CODE_COUNT = 10;

@Injectable()
export class SuperadminMfaService {
  constructor(
    @InjectRepository(SuperadminMfa)
    private readonly configurations: Repository<SuperadminMfa>,
    @InjectRepository(SuperadminMfaRecoveryCode)
    private readonly recoveryCodes: Repository<SuperadminMfaRecoveryCode>,
    private readonly dataSource: DataSource,
  ) {}

  async isEnabled(userId: number) {
    return Boolean(
      await this.configurations.findOneBy({ userId, enabled: true }),
    );
  }

  async startEnrollment(userId: number, email: string) {
    if (await this.isEnabled(userId))
      throw new BadRequestException("Superadmin MFA is already enabled.");
    const key = this.encryptionKey();
    const secret = encodeBase32(randomBytes(20));
    const configuration =
      (await this.findConfiguration(userId)) ??
      this.configurations.create({
        userId,
        secretEncrypted: null,
        pendingSecretEncrypted: null,
        enabled: false,
      });
    configuration.pendingSecretEncrypted = encryptConfigSecret(secret, key);
    await this.configurations.save(configuration);
    const label = encodeURIComponent(`esllp:${email}`);
    return {
      secret,
      otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=esllp&digits=6&period=30`,
    };
  }

  async confirmEnrollment(userId: number, code: string) {
    const key = this.encryptionKey();
    const result = await this.dataSource.transaction(async (manager) => {
      const configurations = manager.getRepository(SuperadminMfa);
      const recoveryCodes = manager.getRepository(SuperadminMfaRecoveryCode);
      const configuration = await configurations.findOne({
        where: { userId },
        select: {
          userId: true,
          secretEncrypted: true,
          pendingSecretEncrypted: true,
          enabled: true,
          lastTotpStep: true,
          updatedAt: true,
        },
      });
      if (!configuration?.pendingSecretEncrypted || configuration.enabled)
        throw new BadRequestException(
          "Start superadmin MFA setup before confirming it.",
        );
      const secret = decryptConfigSecret(
        configuration.pendingSecretEncrypted,
        key,
      );
      const step = matchingTotpStep(secret, code);
      if (step === null)
        throw new BadRequestException("The authenticator code is invalid.");

      const plainCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
        randomBytes(8).toString("hex").toUpperCase(),
      );
      configuration.secretEncrypted = configuration.pendingSecretEncrypted;
      configuration.pendingSecretEncrypted = null;
      configuration.enabled = true;
      configuration.lastTotpStep = step;
      await configurations.save(configuration);
      await recoveryCodes.delete({ userId });
      await recoveryCodes.save(
        plainCodes.map((plainCode) =>
          recoveryCodes.create({
            userId,
            codeHash: hashRecoveryCode(plainCode),
            usedAt: null,
          }),
        ),
      );
      return plainCodes.map(formatRecoveryCode);
    });
    return result;
  }

  async verifyLogin(userId: number, code: string) {
    const configuration = await this.findConfiguration(userId);
    if (!configuration?.enabled || !configuration.secretEncrypted) return false;
    const secret = decryptConfigSecret(
      configuration.secretEncrypted,
      this.encryptionKey(),
    );
    const step = matchingTotpStep(secret, code);
    if (step !== null) {
      const result = await this.configurations
        .createQueryBuilder()
        .update(SuperadminMfa)
        .set({ lastTotpStep: step })
        .where("user_id = :userId", { userId })
        .andWhere("enabled = true")
        .andWhere("(last_totp_step IS NULL OR last_totp_step < :step)", {
          step,
        })
        .execute();
      return result.affected === 1;
    }

    const normalized = code.replace(/[\s-]/g, "").toUpperCase();
    if (!/^[A-F0-9]{16}$/.test(normalized)) return false;
    const result = await this.recoveryCodes.update(
      { userId, codeHash: hashRecoveryCode(normalized), usedAt: IsNull() },
      { usedAt: new Date() },
    );
    return result.affected === 1;
  }

  private async findConfiguration(userId: number) {
    return this.configurations.findOne({
      where: { userId },
      select: {
        userId: true,
        secretEncrypted: true,
        pendingSecretEncrypted: true,
        enabled: true,
        lastTotpStep: true,
        updatedAt: true,
      },
    });
  }

  private encryptionKey() {
    const key = getConfigSecretKey(process.env.MFA_CONFIG_ENCRYPTION_KEY);
    if (!key)
      throw new ServiceUnavailableException(
        "Set MFA_CONFIG_ENCRYPTION_KEY to a stable random value of at least 32 characters before enabling superadmin MFA.",
      );
    return key;
  }
}

function matchingTotpStep(secret: string, value: string) {
  if (!/^\d{6}$/.test(value)) return null;
  const key = decodeBase32(secret);
  const currentStep = Math.floor(Date.now() / 30_000);
  for (let offset = -1; offset <= 1; offset += 1) {
    const step = currentStep + offset;
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = createHmac("sha1", key).update(counter).digest();
    const index = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[index] & 0x7f) << 24) |
      ((digest[index + 1] & 0xff) << 16) |
      ((digest[index + 2] & 0xff) << 8) |
      (digest[index + 3] & 0xff);
    const expected = String(binary % 1_000_000).padStart(6, "0");
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(value);
    if (timingSafeEqual(expectedBuffer, suppliedBuffer)) return step;
  }
  return null;
}

function encodeBase32(value: Buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  let output = "";
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of value.toUpperCase().replace(/=+$/, "")) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("Stored MFA secret is not valid base32.");
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function hashRecoveryCode(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function formatRecoveryCode(value: string) {
  return value.match(/.{4}/g)?.join("-") ?? value;
}
