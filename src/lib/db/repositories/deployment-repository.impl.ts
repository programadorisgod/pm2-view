import { db } from '$lib/db';
import { deployments } from '../schema';
import { and, asc, desc, eq, ne, notInArray, sql } from 'drizzle-orm';
import type {
	IDeploymentRepository,
	CreateDeploymentInput,
	Deployment
} from '$lib/deploy/deployment.types';

export class DeploymentRepository implements IDeploymentRepository {
	async getById(id: string): Promise<Deployment | null> {
		const row = await db.query.deployments.findFirst({
			where: eq(deployments.id, id)
		});
		return row ?? null;
	}

	async getByDeliveryId(deliveryId: string): Promise<Deployment | null> {
		const row = await db.query.deployments.findFirst({
			where: eq(deployments.deliveryId, deliveryId)
		});
		return row ?? null;
	}

	async getByProjectId(projectId: string, limit = 20): Promise<Deployment[]> {
		return await db.query.deployments.findMany({
			where: eq(deployments.projectId, projectId),
			orderBy: [desc(deployments.createdAt)],
			limit
		});
	}

	async getLatestByProjectId(projectId: string): Promise<Deployment | null> {
		const row = await db.query.deployments.findFirst({
			where: eq(deployments.projectId, projectId),
			orderBy: [desc(deployments.createdAt)]
		});
		return row ?? null;
	}

	async create(input: CreateDeploymentInput): Promise<Deployment> {
		const [row] = await db
			.insert(deployments)
			.values({
				id: crypto.randomUUID(),
				projectId: input.projectId,
				repository: input.repository,
				branch: input.branch,
				commitSha: input.commitSha,
				deliveryId: input.deliveryId,
				status: 'pending',
				logs: ''
			})
			.returning();
		return row;
	}

	async markRunning(id: string, startedAt: Date): Promise<void> {
		await db
			.update(deployments)
			.set({ status: 'running', startedAt })
			.where(eq(deployments.id, id));
	}

	async markSuccess(id: string, finishedAt: Date, durationMs: number): Promise<void> {
		await db
			.update(deployments)
			.set({ status: 'success', stage: null, error: null, finishedAt, durationMs })
			.where(eq(deployments.id, id));
	}

	async markFailed(
		id: string,
		stage: string,
		error: string,
		finishedAt: Date,
		durationMs: number
	): Promise<void> {
		await db
			.update(deployments)
			.set({ status: 'failed', stage, error, finishedAt, durationMs })
			.where(eq(deployments.id, id));
	}

	async appendLog(id: string, line: string): Promise<void> {
		const stamped = `[${new Date().toISOString()}] ${line}`;
		await db
			.update(deployments)
			.set({ logs: sql`${deployments.logs} || ${stamped + '\n'}` })
			.where(eq(deployments.id, id));
	}

	async setLogs(id: string, content: string): Promise<void> {
		await db.update(deployments).set({ logs: content }).where(eq(deployments.id, id));
	}

	async setCommitSha(id: string, commitSha: string): Promise<void> {
		await db.update(deployments).set({ commitSha }).where(eq(deployments.id, id));
	}

	async failStaleRunning(): Promise<number> {
		const now = new Date();
		const stale = await db
			.update(deployments)
			.set({
				status: 'failed',
				stage: 'worker',
				error: 'Deployment interrupted (server restart or crash)',
				finishedAt: now,
				durationMs: 0
			})
			.where(eq(deployments.status, 'running'))
			.returning({ id: deployments.id });
		return stale.length;
	}

	async findNextPending(excludeIds: string[] = []): Promise<Deployment | null> {
		const where =
			excludeIds.length > 0
				? and(eq(deployments.status, 'pending'), notInArray(deployments.id, excludeIds))
				: eq(deployments.status, 'pending');
		const row = await db.query.deployments.findFirst({
			where,
			orderBy: [asc(deployments.createdAt)]
		});
		return row ?? null;
	}

	async hasRunningForProject(
		projectId: string,
		excludeDeploymentId?: string
	): Promise<boolean> {
		const conditions = [
			eq(deployments.projectId, projectId),
			eq(deployments.status, 'running')
		];
		if (excludeDeploymentId) {
			conditions.push(ne(deployments.id, excludeDeploymentId));
		}
		const row = await db.query.deployments.findFirst({
			where: and(...conditions)
		});
		return !!row;
	}
}
