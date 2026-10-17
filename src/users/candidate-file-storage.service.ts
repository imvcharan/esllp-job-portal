import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

@Injectable()
export class CandidateFileStorageService {
  private readonly baseUrl = process.env.SUPABASE_URL?.trim().replace(
    /\/+$/,
    "",
  );
  private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  private readonly bucket =
    process.env.SUPABASE_CANDIDATE_BUCKET?.trim() || "candidate-private";

  newObjectPath(userId: number, kind: "photo" | "resume", extension: string) {
    return `${userId}/${kind}/${randomUUID()}.${extension}`;
  }

  async upload(path: string, contentType: string, data: Uint8Array) {
    const body = new Uint8Array(data.byteLength);
    body.set(data);
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
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Private file storage rejected the upload (HTTP ${response.status}).`,
      );
    }
  }

  async createSignedUrl(path: string): Promise<string> {
    const response = await this.request(
      `/object/sign/${encodeURIComponent(this.bucket)}/${this.encodePath(path)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 300 }),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Private file storage could not create a temporary link (HTTP ${response.status}).`,
      );
    }
    const payload: unknown = await response.json();
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
    if (!signedUrl.pathname.startsWith("/storage/v1/object/sign/")) {
      throw new InternalServerErrorException(
        "Private file storage returned an invalid signed-link path.",
      );
    }
    return signedUrl.toString();
  }

  async remove(path: string): Promise<void> {
    const response = await this.request(
      `/object/${encodeURIComponent(this.bucket)}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [path] }),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Private file storage could not remove the previous file (HTTP ${response.status}).`,
      );
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const baseUrl = this.requireBaseUrl();
    const serviceKey = this.serviceKey;
    if (!serviceKey) {
      throw new ServiceUnavailableException(
        "SUPABASE_SERVICE_ROLE_KEY must be configured for private candidate file storage.",
      );
    }

    return fetch(`${baseUrl}/storage/v1${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
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
