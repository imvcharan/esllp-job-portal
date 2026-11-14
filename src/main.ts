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
      path.startsWith("/share/") ||
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
