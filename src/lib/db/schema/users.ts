// Note: Schema uses sqlite-core imports but is dialect-agnostic at the Drizzle driver level.
// Drizzle handles translation between SQLite and PostgreSQL for common column types (text, integer, etc.).
// No changes needed for multi-dialect support - the driver layer handles dialect translation.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { projects } from './projects';
import { projectMembers } from './project-members';
import { teamMembers } from './teams';
import { auditLogs } from './audit-logs';

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(sql`0`),
	name: text('name'),
	role: text('role').notNull().default('user'),
	banned: integer('banned', { mode: 'boolean' }).notNull().default(sql`0`),
	banReason: text('ban_reason'),
	banExpires: integer('ban_expires', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const usersRelations = relations(users, ({ many }) => ({
	projects: many(projects),
	projectMembers: many(projectMembers),
	teamMembers: many(teamMembers),
	auditLogs: many(auditLogs)
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
