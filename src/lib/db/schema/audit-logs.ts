// Note: Schema uses sqlite-core imports but is dialect-agnostic at the Drizzle driver level.
// Drizzle handles translation between SQLite and PostgreSQL for common column types (text, integer, etc.).
// No changes needed for multi-dialect support - the driver layer handles dialect translation.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const auditLogs = sqliteTable('audit_logs', {
	id: text('id').primaryKey(),
	action: text('action').notNull(),
	actorId: text('actor_id').notNull(),
	targetId: text('target_id'),
	resourceType: text('resource_type'),
	resourceId: text('resource_id'),
	details: text('details'), // JSON string with additional details
	timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
	actor: one(users, { fields: [auditLogs.actorId], references: [users.id] })
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
