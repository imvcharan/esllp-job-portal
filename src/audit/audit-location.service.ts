import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { CityResponse, open, Reader } from "maxmind";
import { isIP } from "node:net";

export type AuditLocation = {
  city: string | null;
  region: string | null;
  country: string | null;
};

@Injectable()
export class AuditLocationService implements OnModuleInit {
  private readonly logger = new Logger(AuditLocationService.name);
  private reader: Reader<CityResponse> | null = null;

  async onModuleInit(): Promise<void> {
    const databasePath = process.env.GEOIP_DATABASE_PATH?.trim();
    if (!databasePath) {
      if (process.env.NODE_ENV === "production") {
        this.logger.warn(
          "GEOIP_DATABASE_PATH is not configured; audit events will retain IP addresses without geographic labels.",
        );
      }
      return;
    }

    try {
      this.reader = await open<CityResponse>(databasePath, {
        watchForUpdates: true,
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `The local GeoIP database could not be opened: ${
          error instanceof Error ? error.message : "unknown database error"
        }`,
      );
    }
  }

  lookup(ipAddress: string | null): AuditLocation | null {
    if (!this.reader || !ipAddress) return null;
    const ip = ipAddress.startsWith("::ffff:")
      ? ipAddress.slice("::ffff:".length)
      : ipAddress;
    if (!isIP(ip)) return null;

    try {
      const result = this.reader.get(ip);
      if (!result) return null;
      return {
        city: result.city?.names.en ?? null,
        region: result.subdivisions?.[0]?.names.en ?? null,
        country:
          result.country?.names.en ??
          result.registered_country?.names.en ??
          null,
      };
    } catch (error) {
      this.logger.error(
        `Local GeoIP lookup failed: ${
          error instanceof Error ? error.message : "unknown lookup error"
        }`,
      );
      return null;
    }
  }
}
