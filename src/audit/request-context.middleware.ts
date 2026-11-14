import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { auditRequestContext } from "./audit-request-context";

export function createRequestContextMiddleware(
  logger: Pick<Logger, "log"> = new Logger("HttpRequest"),
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    response.setHeader("X-Request-Id", requestId);
    response.once("finish", () => {
      const routePath =
        typeof request.route?.path === "string" ? request.route.path : null;
      logger.log(
        JSON.stringify({
          event: "http.request",
          requestId,
          method: request.method,
          route: routePath ? `${request.baseUrl}${routePath}` : null,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });
    auditRequestContext.run(
      {
        requestId,
        ipAddress: request.ip ?? null,
        userAgent: request.get("user-agent") ?? null,
      },
      next,
    );
  };
}
