import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects } from './projects';

export const deployCommands = sqliteTable('deploy_commands', {
	id: text('id').primaryKey(),
	projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
	commandType: text('command_type', { enum: ['install', 'build', 'restart', 'post-deploy'] }).notNull(),
	targetProcess: text('target_process'),
	label: text('label').notNull(),
	command: text('command').notNull(),
	sortOrder: integer('sort_order').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
}, (table) => [
	unique('deploy_commands_unique').on(table.projectId, table.commandType, table.sortOrder)
]);

export type DeployCommand = typeof deployCommands.$inferSelect;
export type NewDeployCommand = typeof deployCommands.$inferInsert;