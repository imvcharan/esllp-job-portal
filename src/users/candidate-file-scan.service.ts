import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createConnection, Socket } from "node:net";

@Injectable()
export class CandidateFileScanService {
  private readonly logger = new Logger(CandidateFileScanService.name);

  get configured(): boolean {
    return Boolean(process.env.CLAMAV_HOST?.trim());
  }

  async checkAvailability(): Promise<boolean> {
    const host = process.env.CLAMAV_HOST?.trim();
    if (!host) return false;
    let port: number;
    try {
      port = this.getPort();
    } catch (error) {
      this.logger.warn(
        `ClamAV availability check failed: ${
          error instanceof Error ? error.message : "invalid configuration"
        }`,
      );
      return false;
    }
    return new Promise<boolean>((resolve) => {
      const socket: Socket = createConnection({ host, port });
      let response = "";
      let settled = false;
      const finish = (available: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(available);
      };
      socket.setTimeout(3_000);
      socket.once("connect", () => socket.write("PING\0"));
      socket.on("data", (chunk: Buffer) => {
        response += chunk.toString("utf8");
        if (!response.includes("\0")) return;
        finish(response.replace(/\0.*$/s, "").trim() === "PONG");
      });
      socket.once("timeout", () => finish(false));
      socket.once("error", (error) => {
        this.logger.warn(`ClamAV availability check failed (${error.name}).`);
        finish(false);
      });
    });
  }

  async scan(file: Buffer): Promise<void> {
    const host = process.env.CLAMAV_HOST?.trim();
    if (!host) {
      if (
        process.env.NODE_ENV === "development" &&
        process.env.ALLOW_UNSCANNED_LOCAL_FILES === "true"
      ) {
        this.logger.warn(
          "Local development upload is proceeding without malware scanning.",
        );
        return;
      }
      throw new ServiceUnavailableException(
        "File uploads are unavailable until the malware scanner is configured.",
      );
    }

    const port = this.getPort();

    await new Promise<void>((resolve, reject) => {
      const socket: Socket = createConnection({ host, port });
      let response = "";
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve();
      };
      socket.setTimeout(15_000);
      socket.once("connect", () => {
        socket.write("INSTREAM\0");
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < file.length; offset += chunkSize) {
          const chunk = file.subarray(offset, offset + chunkSize);
          const size = Buffer.allocUnsafe(4);
          size.writeUInt32BE(chunk.length, 0);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on("data", (chunk: Buffer) => {
        response += chunk.toString("utf8");
        if (!response.includes("\0")) return;
        const result = response.replace(/\0.*$/s, "").trim();
        if (/:\s*OK$/.test(result)) finish();
        else if (/:\s*.+\sFOUND$/.test(result))
          finish(
            new BadRequestException(
              "The uploaded file was rejected by the malware scanner.",
            ),
          );
        else
          finish(
            new ServiceUnavailableException(
              "The malware scanner returned an invalid response.",
            ),
          );
      });
      socket.once("end", () => {
        if (!settled)
          finish(
            new ServiceUnavailableException(
              "The malware scanner closed the connection without a complete response.",
            ),
          );
      });
      socket.once("timeout", () =>
        finish(
          new ServiceUnavailableException(
            "The malware scanner did not respond in time.",
          ),
        ),
      );
      socket.once("error", (error) =>
        finish(
          new ServiceUnavailableException(
            `The malware scanner could not be reached: ${error.message}`,
            { cause: error },
          ),
        ),
      );
    });
  }

  private getPort(): number {
    const portText = process.env.CLAMAV_PORT?.trim() || "3310";
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException("CLAMAV_PORT is invalid.");
    }
    return port;
  }
}
