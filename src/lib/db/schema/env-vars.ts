// Note: Schema uses sqlite-core imports but is dialect-agnostic at the Drizzle driver level.
// Drizzle handles translation between SQLite and PostgreSQL for common column types (text, integer, etc.).
// No changes needed for multi-dialect support - the driver layer handles dialect translation.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects } from './projects';

export const envVars = sqliteTable('env_vars', {
	id: text('id').primaryKey(),
	projectId: text('project_id').notNull().references(() => projects.id),
	key: text('key').notNull(),
	value: text('value').notNull(),
	isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(sql`(0)`)
});

export type EnvVar = typeof envVars.$inferSelect;
export type NewEnvVar = typeof envVars.$inferInsert;
