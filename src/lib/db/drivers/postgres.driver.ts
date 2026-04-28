import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import type { DatabaseDriver, DatabaseDialect } from '../driver.interface';
import * as schema from '../schema';

export class PostgresDriver implements DatabaseDriver {
  readonly dialect: DatabaseDialect = 'postgres';
  private pool: Pool | null = null;
  private connected = false;

  constructor(
    private connectionString: string
  ) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    
    this.pool = new Pool({
      connectionString: this.connectionString
    });
    
    // Test connection
    const client = await this.pool.connect();
    client.release();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
    }
  }

  getClient() {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return drizzle(this.pool, { schema });
  }

  isConnected(): boolean {
    return this.connected && this.pool !== null;
  }
}
