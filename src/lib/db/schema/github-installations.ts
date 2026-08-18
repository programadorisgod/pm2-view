import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql, relations } from 'drizzle-orm';
import { users } from './users';

export const githubInstallations = sqliteTable('github_installations', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id),
	installationId: integer('installation_id').notNull().unique(),
	accountLogin: text('account_login').notNull(),
	accountType: text('account_type').notNull(),
	accountAvatar: text('account_avatar'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const githubInstallationsRelations = relations(githubInstallations, ({ one }) => ({
	user: one(users, { fields: [githubInstallations.userId], references: [users.id] })
}));

export type GitHubInstallation = typeof githubInstallations.$inferSelect;
export type NewGitHubInstallation = typeof githubInstallations.$inferInsert;
