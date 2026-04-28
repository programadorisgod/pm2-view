import type { DatabaseDialect } from './driver.interface';

interface DialectRule {
  match: (url: string) => boolean;
  dialect: DatabaseDialect;
}

/**
 * Registry of dialect detection rules.
 * Open/Closed: add new dialects by pushing a rule — no existing code changes.
 */
const DIALECT_RULES: DialectRule[] = [
  { match: (url) => url.startsWith('libsql://') || url.startsWith('file:') || url.startsWith(':memory:'), dialect: 'libsql' },
  { match: (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'), dialect: 'postgres' },
];

/**
 * Detect database dialect from connection URL using registered rules.
 * Returns undefined if no rule matches (caller decides whether to throw or use default).
 */
export function detectDialect(url: string): DatabaseDialect | undefined {
  const rule = DIALECT_RULES.find((r) => r.match(url));
  return rule?.dialect;
}

/**
 * Register a new dialect detection rule at runtime.
 * Useful for plugins or custom database drivers.
 */
export function registerDialectRule(rule: DialectRule): void {
  DIALECT_RULES.push(rule);
}
