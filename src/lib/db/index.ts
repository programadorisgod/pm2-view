import { createDatabaseDriver } from './factory';
import { getDatabaseConfig } from './config';
import type { DatabaseDriver } from './driver.interface';

import type { LibsqlDriver } from './drivers/libsql.driver';

export type AppDatabase = ReturnType<LibsqlDriver['getClient']>;

// Lazy initialization — same behavior as before
let driver: DatabaseDriver | null = null;

function getDriver(): DatabaseDriver {
  if (!driver) {
    const config = getDatabaseConfig();
    driver = createDatabaseDriver(config);
  }
  return driver;
}

// Create a proxy that lazily initializes the db client
// The proxy dynamically accesses properties from the Drizzle client at runtime
const dbProxy = new Proxy({} as AppDatabase, {
  get(_, prop: string | symbol) {
    const drv = getDriver();
    const client = drv.getClient() as Record<string | symbol, unknown>;
    return (client as any)[prop];
  }
});

export const db: AppDatabase = dbProxy;
export const drizzle: AppDatabase = dbProxy;
export { createDatabaseDriver } from './factory';
export type { DatabaseDriver, DatabaseDialect } from './driver.interface';
export type { DatabaseConfig } from './factory';
