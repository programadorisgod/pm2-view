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
