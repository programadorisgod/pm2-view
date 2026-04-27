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
