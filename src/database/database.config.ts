import 'dotenv/config';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured to connect to PostgreSQL.`);
  }
  return value;
}

export function getDatabaseConfig(): PostgresConnectionOptions {
  const ssl = process.env.POSTGRES_SSL?.trim().toLowerCase() === 'true';
  const connectionString = process.env.DATABASE_URL?.trim();

  if (connectionString) {
    return {
      type: 'postgres',
      url: connectionString,
      ...(ssl ? { ssl: true } : {}),
    };
  }

  const portValue = process.env.POSTGRES_PORT?.trim() || '5432';
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('POSTGRES_PORT must be a valid TCP port number.');
  }

  return {
    type: 'postgres',
    host: requiredEnvironmentVariable('POSTGRES_HOST'),
    port,
    username: requiredEnvironmentVariable('POSTGRES_USER'),
    password: requiredEnvironmentVariable('POSTGRES_PASSWORD'),
    database: requiredEnvironmentVariable('POSTGRES_DATABASE'),
    ...(ssl ? { ssl: true } : {}),
  };
}
