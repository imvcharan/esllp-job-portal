import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get("live")
  getLiveness() {
    return { status: "ok" };
  }

  @Get("ready")
  async getReadiness() {
    if (!this.dataSource.isInitialized) {
      throw new ServiceUnavailableException("Database is unavailable.");
    }

    try {
      await this.dataSource.query("SELECT 1");
    } catch (error) {
      this.logger.error(
        `Database readiness probe failed (${error instanceof Error ? error.name : "unknown error"}).`,
      );
      throw new ServiceUnavailableException("Database is unavailable.");
    }

    return { status: "ready", checks: { database: "ok" } };
  }
}
