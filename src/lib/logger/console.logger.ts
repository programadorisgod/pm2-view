import type { Logger } from './logger.interface';

export class ConsoleLogger implements Logger {
  private prefix: string;

  constructor(prefix = 'pm2-view') {
    this.prefix = prefix;
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.log(`[${this.prefix}] ℹ️  ${this.formatMessage(message, context)}`);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(`[${this.prefix}] ⚠️  ${this.formatMessage(message, context)}`);
  }

  error(message: string, context?: Record<string, unknown>): void {
    console.error(`[${this.prefix}] ❌ ${this.formatMessage(message, context)}`);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (process.env.DEBUG === 'true') {
      console.debug(`[${this.prefix}] 🔍 ${this.formatMessage(message, context)}`);
    }
  }

  private formatMessage(message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${message}${contextStr}`;
  }
}
