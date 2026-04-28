import type { DatabaseDriver, DatabaseDialect } from './driver.interface';
import { LibsqlDriver } from './drivers/libsql.driver';
import { PostgresDriver } from './drivers/postgres.driver';
import { detectDialect } from './dialect-registry';

export interface DatabaseConfig {
  url: string;
  authToken?: string;
  dialect?: DatabaseDialect;
}

const DRIVER_MAP: Record<DatabaseDialect, (config: DatabaseConfig) => DatabaseDriver> = {
  libsql: (config) => new LibsqlDriver(config.url, config.authToken),
  postgres: (config) => new PostgresDriver(config.url),
};

export function createDatabaseDriver(config: DatabaseConfig): DatabaseDriver {
  const dialect = config.dialect ?? detectDialect(config.url);

  if (!dialect) {
    throw new Error(`Unable to detect database dialect from URL: ${config.url}. Set dialect explicitly or use a recognized URL format.`);
  }

  const createDriver = DRIVER_MAP[dialect];
  if (!createDriver) {
    throw new Error(`Unsupported database dialect: ${dialect}. Register a driver in DRIVER_MAP.`);
  }

  return createDriver(config);
}
