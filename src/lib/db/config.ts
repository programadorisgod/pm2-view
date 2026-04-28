import { env } from '$env/dynamic/private';
import type { DatabaseConfig } from './factory';
import { detectDialect } from './dialect-registry';

export function getDatabaseConfig(): DatabaseConfig {
  // Support both new DATABASE_URL and legacy TURSO_DATABASE_URL
  const url = env.DATABASE_URL || env.TURSO_DATABASE_URL || '';

  if (!url) {
    throw new Error('DATABASE_URL or TURSO_DATABASE_URL is not set. Check your .env file.');
  }

  const authToken = env.TURSO_AUTH_TOKEN;
  const dialect = detectDialect(url);

  return {
    url,
    authToken: dialect === 'libsql' ? authToken : undefined,
    dialect
  };
}
