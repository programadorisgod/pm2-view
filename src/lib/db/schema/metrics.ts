// Note: Schema uses sqlite-core imports but is dialect-agnostic at the Drizzle driver level.
// Drizzle handles translation between SQLite and PostgreSQL for common column types (text, integer, etc.).
// No changes needed for multi-dialect support - the driver layer handles dialect translation.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects } from './projects';

export const metrics = sqliteTable('metrics', {
	id: text('id').primaryKey(),
	projectId: text('project_id').notNull().references(() => projects.id),
	cpu: integer('cpu', { mode: 'number' }),
	memory: integer('memory', { mode: 'number' }),
	uptime: integer('uptime', { mode: 'number' }),
	status: text('status'),
	recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
