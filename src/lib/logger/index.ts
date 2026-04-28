export type { Logger } from './logger.interface';
export { ConsoleLogger } from './console.logger';

import { ConsoleLogger } from './console.logger';
export const logger = new ConsoleLogger();
