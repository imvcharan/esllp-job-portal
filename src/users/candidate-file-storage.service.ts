import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";

@Injectable()
export class CandidateFileStorageService {
  private readonly logger = new Logger(CandidateFileStorageService.name);
  private readonly baseUrl = process.env.SUPABASE_URL?.trim().replace(
    /\/+$/,
    "",
  );
  private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  private readonly bucket =
    process.env.SUPABASE_CANDIDATE_BUCKET?.trim() || "candidate-private";

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  newObjectPath(
    userId: number,
    kind: "photo" | "resume" | "application",
    extension: string,
  ) {
    return `${userId}/${kind}/${randomUUID()}.${extension}`;
  }

  async upload(path: string, contentType: string, data: Uint8Array) {
    const body = new ArrayBuffer(data.byteLength);
    new Uint8Array(body).set(data);
    const response = await this.request(
      `/object/${encodeURIComponent(this.bucket)}/${this.encodePath(path)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "x-upsert": "false",
        },
        body,
      },
      "upload",
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Private file storage rejected the upload (HTTP ${response.status}).`,
      );
    }
  }

  async createSignedUrl(path: string): Promise<string> {
    const status = await this.scanStatus(path);
    if (status !== "clean") {
      throw new ServiceUnavailableException(
        "This private file is unavailable until its security scan is complete.",
      );
    }
    const response = await this.request(
      `/object/sign/${encodeURIComponent(this.bucket)}/${this.encodePath(path)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 300 }),
      },
      "create a temporary file link",
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Private file storage could not create a temporary link (HTTP ${response.status}).`,
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new InternalServerErrorException(
        "Private file storage returned an invalid signed-link response.",
        { cause: error },
      );
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      !("signedURL" in payload) ||
      typeof payload.signedURL !== "string"
    ) {
      throw new InternalServerErrorException(
        "Private file storage returned an invalid signed-link response.",
      );
    }

    const baseUrl = this.requireBaseUrl();
    const signedUrl = new URL(payload.signedURL, `${baseUrl}/storage/v1/`);
    if (signedUrl.origin !== new URL(baseUrl).origin) {
      throw new InternalServerErrorException(
        "Private file storage returned a signed link for an unexpected host.",
      );
    }
    if (signedUrl.pathname.startsWith("/object/")) {
      signedUrl.pathname = `/storage/v1${signedUrl.pathname}`;
    }
    const expectedPath = `/storage/v1/object/sign/${encodeURIComponent(this.bucket)}/${this.encodePath(path)}`;
    if (
      signedUrl.protocol !== "https:" &&
      !(
        signedUrl.protocol === "http:" &&
        new URL(baseUrl).hostname === "localhost"
      )
    ) {
      throw new InternalServerErrorException(
        "Private file storage returned an insecure signed link.",
      );
    }
    if (
      signedUrl.pathname !== expectedPath ||
      !signedUrl.searchParams.has("token") ||
      signedUrl.hash
    ) {
      throw new InternalServerErrorException(
        "Private file storage returned an invalid signed-link path.",
      );
    }
    return signedUrl.toString();
  }

  async remove(path: string): Promise<void> {
    await this.removeMany([path]);
  }

  async removeMany(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const response = await this.request(
      `/object/${encodeURIComponent(this.bucket)}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      },
      "remove candidate files",
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Private file storage could not remove candidate files (HTTP ${response.status}).`,
      );
    }
  }

  async downloadForScan(path: string): Promise<Buffer> {
    const response = await this.request(
      `/object/${encodeURIComponent(this.bucket)}/${this.encodePath(path)}`,
      { method: "GET" },
      "read a private file for scanning",
    );
    if (!response.ok || !response.body) {
      throw new ServiceUnavailableException(
        `Private file storage could not provide a file for scanning (HTTP ${response.status}).`,
      );
    }
    const maximumBytes = 8 * 1024 * 1024;
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maximumBytes) {
      throw new ServiceUnavailableException(
        "A legacy private file exceeds the supported malware-scan size.",
      );
    }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new ServiceUnavailableException(
          "A legacy private file exceeds the supported malware-scan size.",
        );
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, totalBytes);
  }

  async scanStatus(
    path: string,
  ): Promise<"pending" | "clean" | "infected" | null> {
    const rows = (await this.dataSource.query(
      `SELECT status
       FROM candidate_private_file_scans
       WHERE storage_path = $1`,
      [path],
    )) as Array<{ status: "pending" | "clean" | "infected" }>;
    return rows[0]?.status ?? null;
  }

  async scanStatuses(
    paths: string[],
  ): Promise<Map<string, "pending" | "clean" | "infected">> {
    if (!paths.length) return new Map();
    const rows = (await this.dataSource.query(
      `SELECT storage_path AS path, status
       FROM candidate_private_file_scans
       WHERE storage_path = ANY($1::text[])`,
      [paths],
    )) as Array<{
      path: string;
      status: "pending" | "clean" | "infected";
    }>;
    return new Map(rows.map(({ path, status }) => [path, status]));
  }

  async markClean(
    path: string,
    ownerUserId: number,
    kind: "photo" | "resume" | "application",
    contentType: string,
    manager?: EntityManager,
  ): Promise<void> {
    const executor = manager ?? this.dataSource;
    await executor.query(
      `INSERT INTO candidate_private_file_scans
         (storage_path, owner_user_id, file_kind, content_type, status,
          attempts, next_attempt_at, scanned_at, last_error)
       VALUES ($1, $2, $3, $4, 'clean', 0, now(), now(), NULL)
       ON CONFLICT (storage_path) DO UPDATE
       SET owner_user_id = EXCLUDED.owner_user_id,
           file_kind = EXCLUDED.file_kind,
           content_type = EXCLUDED.content_type,
           status = 'clean',
           attempts = 0,
           next_attempt_at = now(),
           claim_token = NULL,
           claimed_until = NULL,
           scanned_at = now(),
           last_error = NULL`,
      [path, ownerUserId, kind, contentType],
    );
  }

  async enqueueCleanup(
    paths: string[],
    manager?: EntityManager,
  ): Promise<void> {
    const uniquePaths = [...new Set(paths.filter((path) => path.trim()))];
    if (!uniquePaths.length) return;
    const executor = manager ?? this.dataSource;
    await executor.query(
      `INSERT INTO candidate_private_file_cleanup_outbox (storage_path)
       SELECT path
       FROM unnest($1::text[]) AS path
       ON CONFLICT (storage_path) DO NOTHING`,
      [uniquePaths],
    );
  }

  async operationalStatus() {
    const [counts] = (await this.dataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS "scanPending",
         COUNT(*) FILTER (WHERE status = 'infected')::int AS "scanInfected",
         COUNT(*) FILTER (
           WHERE status = 'pending' AND attempts > 0
         )::int AS "scanRetries",
         (SELECT COUNT(*)::int
          FROM candidate_private_file_cleanup_outbox) AS "cleanupPending",
         (SELECT COUNT(*)::int
          FROM candidate_private_file_cleanup_outbox
          WHERE attempts >= 5) AS "cleanupHighAttempts"
       FROM candidate_private_file_scans`,
    )) as Array<{
      scanPending: number | string;
      scanInfected: number | string;
      scanRetries: number | string;
      cleanupPending: number | string;
      cleanupHighAttempts: number | string;
    }>;
    const configured = Boolean(this.baseUrl && this.serviceKey);
    let ready = false;
    if (configured) {
      try {
        const response = await this.request(
          `/bucket/${encodeURIComponent(this.bucket)}`,
          { method: "GET" },
          "check storage availability",
        );
        ready = response.ok;
      } catch (error) {
        this.logger.warn(
          `Private file storage health check failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }
    return {
      configured,
      ready,
      bucket: this.bucket,
      scans: {
        pending: Number(counts.scanPending),
        infected: Number(counts.scanInfected),
        retrying: Number(counts.scanRetries),
      },
      cleanup: {
        pending: Number(counts.cleanupPending),
        highAttempts: Number(counts.cleanupHighAttempts),
      },
    };
  }

  async deleteScanState(
    paths: string[],
    manager?: EntityManager,
  ): Promise<void> {
    if (!paths.length) return;
    const executor = manager ?? this.dataSource;
    await executor.query(
      `DELETE FROM candidate_private_file_scans
       WHERE storage_path = ANY($1::text[])`,
      [paths],
    );
  }

  private async request(
    path: string,
    init: RequestInit,
    operation: string,
  ): Promise<Response> {
    const baseUrl = this.requireBaseUrl();
    const serviceKey = this.serviceKey;
    if (!serviceKey) {
      throw new ServiceUnavailableException(
        "SUPABASE_SERVICE_ROLE_KEY must be configured for private candidate file storage.",
      );
    }

    try {
      return await fetch(`${baseUrl}/storage/v1${path}`, {
        ...init,
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          ...init.headers,
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : "unknown error";
      this.logger.warn(
        `Private file storage ${operation} request failed (${reason}).`,
      );
      throw new ServiceUnavailableException(
        `Private file storage is unavailable while attempting to ${operation}.`,
        { cause: error },
      );
    }
  }

  private requireBaseUrl(): string {
    if (!this.baseUrl) {
      throw new ServiceUnavailableException(
        "SUPABASE_URL must be configured for private candidate file storage.",
      );
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(this.baseUrl);
    } catch (error) {
      throw new ServiceUnavailableException(
        "SUPABASE_URL must be a valid HTTPS URL.",
        { cause: error },
      );
    }
    if (
      parsedUrl.protocol !== "https:" &&
      !(parsedUrl.protocol === "http:" && parsedUrl.hostname === "localhost")
    ) {
      throw new ServiceUnavailableException(
        "SUPABASE_URL must use HTTPS for private candidate file storage.",
      );
    }
    return this.baseUrl;
  }

  private encodePath(path: string): string {
    return path.split("/").map(encodeURIComponent).join("/");
  }
}
