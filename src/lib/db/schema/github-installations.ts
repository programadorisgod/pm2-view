import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql, relations } from 'drizzle-orm';
import { users } from './users';

export const githubInstallations = sqliteTable('github_installations', {
	id: text('id').primaryKey(),
	// userId is nullable: the installation is owned by the org, not a single user.
	// The first user who connected it may be stored here for reference.
	userId: text('user_id').references(() => users.id),
	installationId: integer('installation_id').notNull(), // No longer unique - org installations are shared
	accountLogin: text('account_login').notNull(),
	accountType: text('account_type').notNull(),
	accountAvatar: text('account_avatar'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const githubInstallationsRelations = relations(githubInstallations, ({ one, many }) => ({
	user: one(users, { fields: [githubInstallations.userId], references: [users.id] }),
	// Each installation can have multiple users associated via the junction table
	userInstallations: many(githubUserInstallations)
}));

// Junction table: many users can access the same installation (org membership)
export const githubUserInstallations = sqliteTable('github_user_installations', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id),
	installationId: integer('installation_id').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const githubUserInstallationsRelations = relations(githubUserInstallations, ({ one }) => ({
	user: one(users, { fields: [githubUserInstallations.userId], references: [users.id] }),
	installation: one(githubInstallations, {
		fields: [githubUserInstallations.installationId],
		references: [githubInstallations.installationId]
	})
}));

export type GitHubInstallation = typeof githubInstallations.$inferSelect;
export type NewGitHubInstallation = typeof githubInstallations.$inferInsert;
export type GitHubUserInstallation = typeof githubUserInstallations.$inferSelect;
export type NewGitHubUserInstallation = typeof githubUserInstallations.$inferInsert;
