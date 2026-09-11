export type { Logger } from './logger.interface';
export { ConsoleLogger } from './console.logger';
export { PinoLogger } from './pino.logger';

import { dev } from '$app/environment';
import { ConsoleLogger } from './console.logger';
import { PinoLogger } from './pino.logger';
import type { Logger } from './logger.interface';

// In development, use ConsoleLogger for readable terminal logs.
// In production, use PinoLogger for granular, high-performance structured JSON logging.
export const logger: Logger = dev ? new ConsoleLogger() : new PinoLogger();
