// Note: Schema uses sqlite-core imports but is dialect-agnostic at the Drizzle driver level.
// Drizzle handles translation between SQLite and PostgreSQL for common column types (text, integer, etc.).
// No changes needed for multi-dialect support - the driver layer handles dialect translation.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { projects } from './projects';
import { users } from './users';

export const projectMembers = sqliteTable('project_members', {
	id: text('id').primaryKey(),
	projectId: text('project_id').notNull().references(() => projects.id),
	userId: text('user_id').notNull().references(() => users.id),
	role: text('role').notNull(), // 'owner', 'editor', 'viewer'
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
	project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
	user: one(users, { fields: [projectMembers.userId], references: [users.id] })
}));

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
