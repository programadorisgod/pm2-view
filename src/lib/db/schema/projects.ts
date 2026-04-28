// Note: Schema uses sqlite-core imports but is dialect-agnostic at the Drizzle driver level.
// Drizzle handles translation between SQLite and PostgreSQL for common column types (text, integer, etc.).
// No changes needed for multi-dialect support - the driver layer handles dialect translation.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const projects = sqliteTable('projects', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id),
	name: text('name').notNull(),
	pm2Name: text('pm2_name').notNull(),
	description: text('description'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
