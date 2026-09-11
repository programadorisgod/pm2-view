import pino from 'pino';
import type { Logger } from './logger.interface';

export class PinoLogger implements Logger {
  private pinoInstance: pino.Logger;

  constructor(prefix = 'pm2-view') {
    const logLevel = process.env.LOG_LEVEL || 'info';
    this.pinoInstance = pino({
      name: prefix,
      level: logLevel,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) {
          return { level: label };
        }
      }
    });
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.pinoInstance.info(context, message);
    } else {
      this.pinoInstance.info(message);
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.pinoInstance.warn(context, message);
    } else {
      this.pinoInstance.warn(message);
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.pinoInstance.error(context, message);
    } else {
      this.pinoInstance.error(message);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.pinoInstance.debug(context, message);
    } else {
      this.pinoInstance.debug(message);
    }
  }
}
