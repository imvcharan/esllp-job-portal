import "dotenv/config";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { RequestMethod } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { auditRequestContext } from "./audit/audit-request-context";

async function bootstrap(): Promise<void> {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_ACCESS_SECRET.length < 32)
  ) {
    throw new Error(
      "JWT_ACCESS_SECRET must be configured with at least 32 characters in production.",
    );
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
  }
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set("trust proxy", trustProxyHops);
  }
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.use((request: Request, _response: Response, next: NextFunction) => {
    auditRequestContext.run(
      {
        ipAddress: request.ip ?? null,
        userAgent: request.get("user-agent") ?? null,
      },
      () => next(),
    );
  });
  app.useStaticAssets(resolve(process.cwd(), "public"), {
    index: "index.html",
  });
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "share/jobs/:id", method: RequestMethod.GET },
      { path: "sitemap.xml", method: RequestMethod.GET },
      { path: "robots.txt", method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000, "0.0.0.0");
}

void bootstrap();
