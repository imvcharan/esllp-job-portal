import "dotenv/config";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { RequestMethod } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { createRequestContextMiddleware } from "./audit/request-context.middleware";

async function bootstrap(): Promise<void> {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_ACCESS_SECRET.length < 32 ||
      /replace|example|change.?me|your.?secret/i.test(
        process.env.JWT_ACCESS_SECRET,
      ))
  ) {
    throw new Error(
      "JWT_ACCESS_SECRET must be a unique, non-placeholder value of at least 32 characters in production.",
    );
  }
  if (process.env.NODE_ENV === "production") {
    const warnings: string[] = [];
    if (!process.env.PUBLIC_APP_URL?.trim()) {
      warnings.push("PUBLIC_APP_URL");
    }
    if (
      !process.env.SUPABASE_URL?.trim() ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    ) {
      warnings.push("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");
    }
    if (!process.env.CLAMAV_HOST?.trim()) {
      warnings.push("CLAMAV_HOST");
    }
    if (!process.env.SMTP_HOST?.trim() || !process.env.SMTP_FROM?.trim()) {
      warnings.push("SMTP_HOST/SMTP_FROM");
    }
    if (
      !process.env.RECAPTCHA_SITE_KEY?.trim() ||
      !process.env.RECAPTCHA_SECRET_KEY?.trim()
    ) {
      warnings.push("RECAPTCHA_SITE_KEY/RECAPTCHA_SECRET_KEY");
    }
    if (warnings.length) {
      console.warn(
        `[configuration] Production capabilities are disabled or incomplete: ${warnings.join(", ")}`,
      );
    }
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    next();
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
  app.use(createRequestContextMiddleware());
  app.useStaticAssets(resolve(process.cwd(), "public"), {
    index: "index.html",
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const path = request.path;
    if (
      request.method !== "GET" ||
      path === "/api" ||
      path.startsWith("/api/") ||
      path === "/admin" ||
      path.startsWith("/admin/") ||
      path === "/setup-superadmin" ||
      path.startsWith("/setup-superadmin/") ||
      path === "/health/metrics" ||
      path.startsWith("/share/") ||
      path.startsWith("/companies/") ||
      path.startsWith("/pages/") ||
      path.startsWith("/jobs/categories/") ||
      path.startsWith("/jobs/locations/") ||
      path === "/health/live" ||
      path === "/health/ready" ||
      /\.[^/]+$/.test(path)
    ) {
      next();
      return;
    }
    response.sendFile(
      resolve(process.cwd(), "public", "index.html"),
      (error?: Error) => {
        if (error) next(error);
      },
    );
  });
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "share/jobs/:id", method: RequestMethod.GET },
      { path: "jobs/categories/:slug", method: RequestMethod.GET },
      { path: "jobs/locations/:slug", method: RequestMethod.GET },
      { path: "pages/:slug", method: RequestMethod.GET },
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
  if (process.env.NODE_ENV !== "production") {
    const openApiConfig = new DocumentBuilder()
      .setTitle("esllp Job Portal API")
      .setDescription("REST API for the esllp recruitment portal.")
      .setVersion("1.0.0")
      .build();
    const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
    SwaggerModule.setup("docs", app, openApiDocument, {
      useGlobalPrefix: true,
      jsonDocumentUrl: "openapi.json",
    });
  }
  await app.listen(process.env.PORT ?? 3000, "0.0.0.0");
}

void bootstrap();
