import "dotenv/config";
import { NestFactory } from "@nestjs/core";

async function bootstrap(): Promise<void> {
  const configuredRole = process.env.APP_PROCESS_ROLE?.trim();
  if (configuredRole && configuredRole !== "worker") {
    throw new Error("The workers command requires APP_PROCESS_ROLE=worker.");
  }
  process.env.APP_PROCESS_ROLE = "worker";

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

  const { AppModule } = await import("../app.module");
  const app = await NestFactory.createApplicationContext(AppModule);
  const keepAlive = setInterval(() => undefined, 60_000);
  const shutdown = () => {
    clearInterval(keepAlive);
    void app.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void bootstrap().catch((error: unknown) => {
  console.error(
    `Background worker bootstrap failed: ${
      error instanceof Error ? error.message : "unknown error"
    }`,
  );
  process.exitCode = 1;
});
