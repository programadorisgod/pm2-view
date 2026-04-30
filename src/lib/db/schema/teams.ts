// Note: Schema uses sqlite-core imports but is dialect-agnostic at the Drizzle driver level.
// Drizzle handles translation between SQLite and PostgreSQL for common column types (text, integer, etc.).
// No changes needed for multi-dialect support - the driver layer handles dialect translation.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const teams = sqliteTable('teams', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const teamsRelations = relations(teams, ({ many }) => ({
	teamMembers: many(teamMembers)
}));

export const teamMembers = sqliteTable('team_members', {
	id: text('id').primaryKey(),
	teamId: text('team_id').notNull().references(() => teams.id),
	userId: text('user_id').notNull().references(() => users.id),
	role: text('role').notNull(), // 'team_owner', 'team_admin', 'team_member'
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
	team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
	user: one(users, { fields: [teamMembers.userId], references: [users.id] })
}));

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
