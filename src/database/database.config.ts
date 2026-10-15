import 'dotenv/config';
import type { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured to connect to MySQL.`);
  }
  return value;
}

export function getDatabaseConfig(): MysqlConnectionOptions {
  const portValue = process.env.MYSQL_PORT?.trim() || '3306';
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MYSQL_PORT must be a valid TCP port number.');
  }

  return {
    type: 'mysql',
    host: requiredEnvironmentVariable('MYSQL_HOST'),
    port,
    username: requiredEnvironmentVariable('MYSQL_USER'),
    password: requiredEnvironmentVariable('MYSQL_PASSWORD'),
    database: requiredEnvironmentVariable('MYSQL_DATABASE'),
    timezone: 'Z',
  };
}
