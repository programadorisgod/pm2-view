import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects } from './projects';

export const DEPLOYMENT_STATUSES = ['pending', 'running', 'success', 'failed', 'cancelled'] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const deployments = sqliteTable(
	'deployments',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		repository: text('repository').notNull(),
		branch: text('branch').notNull(),
		commitSha: text('commit_sha'),
		deliveryId: text('delivery_id').notNull().unique(),
		status: text('status', { enum: DEPLOYMENT_STATUSES }).notNull().default('pending'),
		stage: text('stage'),
		error: text('error'),
		logs: text('logs').notNull().default(''),
		startedAt: integer('started_at', { mode: 'timestamp' }),
		finishedAt: integer('finished_at', { mode: 'timestamp' }),
		durationMs: integer('duration_ms'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
	},
	(table) => [
		index('deployments_project_created_idx').on(table.projectId, table.createdAt),
		index('deployments_status_idx').on(table.status)
	]
);

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
