import 'dotenv/config';
import { X509Certificate } from 'node:crypto';
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
  const configuredSslCa = process.env.POSTGRES_SSL_CA?.trim().replace(/\\n/g, '\n');
  const sslCa = configuredSslCa?.replace(
    /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g,
    (_match, body: string) => {
      const base64 = body.replace(/\s/g, '');
      const lines = base64.match(/.{1,64}/g)?.join('\n') ?? '';
      return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
    },
  );
  const connectionString = process.env.DATABASE_URL?.trim();

  if (sslCa && !ssl) {
    throw new Error(
      'POSTGRES_SSL must be true when POSTGRES_SSL_CA is configured.',
    );
  }

  if (sslCa && !sslCa.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error(
      'POSTGRES_SSL_CA must contain the complete PEM certificate.',
    );
  }

  if (ssl) {
    if (sslCa) {
      let certificate: X509Certificate;
      try {
        certificate = new X509Certificate(sslCa);
      } catch (error) {
        throw new Error(
          'POSTGRES_SSL_CA must be a valid PEM-encoded X.509 certificate.',
          { cause: error },
        );
      }
      console.info(
        `[database] Custom TLS CA loaded (SHA-256 fingerprint: ${certificate.fingerprint256}).`,
      );
    } else {
      console.warn(
        '[database] TLS is enabled without a custom CA certificate.',
      );
    }
  }

  const sslOptions = ssl
    ? sslCa
      ? { ca: sslCa, rejectUnauthorized: true }
      : true
    : undefined;

  if (connectionString) {
    const parsedConnectionString = new URL(connectionString);
    for (const parameter of [
      'ssl',
      'sslmode',
      'sslcert',
      'sslkey',
      'sslrootcert',
    ]) {
      parsedConnectionString.searchParams.delete(parameter);
    }

    return {
      type: 'postgres',
      url: parsedConnectionString.toString(),
      ...(sslOptions ? { ssl: sslOptions } : {}),
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
    ...(sslOptions ? { ssl: sslOptions } : {}),
  };
}
