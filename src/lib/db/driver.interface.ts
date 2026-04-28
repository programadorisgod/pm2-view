export type DatabaseDialect = 'libsql' | 'postgres';

export interface DatabaseDriver {
  readonly dialect: DatabaseDialect;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getClient(): unknown;
  isConnected(): boolean;
}
