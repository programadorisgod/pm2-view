import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { users } from './users';

/**
 * User favorites for PM2 projects.
 * Uses pm2Name (process name) since projects are PM2 processes,
 * not necessarily DB rows.
 */
export const projectFavorites = sqliteTable('project_favorites', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id),
	pm2Name: text('pm2_name').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const projectFavoritesRelations = relations(projectFavorites, ({ one }) => ({
	user: one(users, { fields: [projectFavorites.userId], references: [users.id] })
}));

export type ProjectFavorite = typeof projectFavorites.$inferSelect;
export type NewProjectFavorite = typeof projectFavorites.$inferInsert;
