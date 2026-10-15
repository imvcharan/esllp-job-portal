import 'dotenv/config';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_ACCESS_SECRET.length < 32)
  ) {
    throw new Error(
      'JWT_ACCESS_SECRET must be configured with at least 32 characters in production.',
    );
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.useStaticAssets(resolve(process.cwd(), 'public'), {
    index: 'index.html',
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
