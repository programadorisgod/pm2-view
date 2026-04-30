import { drizzle } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import type { DatabaseDriver, DatabaseDialect } from '../driver.interface';
import * as schema from '../schema';

export class LibsqlDriver implements DatabaseDriver {
  readonly dialect: DatabaseDialect = 'libsql';
  private client: Client | null = null;
  private connected = false;

  constructor(
    private url: string,
    private authToken?: string
  ) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    
    this.client = createClient({
      url: this.url,
      authToken: this.authToken
    });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      // libsql client doesn't have explicit close, but we null it out
      this.client = null;
      this.connected = false;
    }
  }

  getClient() {
    // Auto-connect if not already connected (createClient is synchronous)
    if (!this.client) {
      this.client = createClient({
        url: this.url,
        authToken: this.authToken
      });
      this.connected = true;
    }
    return drizzle(this.client, { schema });
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }
}
