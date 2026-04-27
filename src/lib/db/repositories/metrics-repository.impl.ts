import { db } from '../db';
import { metrics } from '../schema';
import { eq, desc } from 'drizzle-orm';
import type { IMetricsRepository, Metric } from '../../metrics/metrics.types';

export class MetricsRepository implements IMetricsRepository {
	async record(metric: Omit<Metric, 'id' | 'recordedAt'>): Promise<Metric> {
		const [newMetric] = await db
			.insert(metrics)
			.values({
				...metric,
				id: crypto.randomUUID()
			})
			.returning();
		return newMetric;
	}

	async getByProjectId(projectId: string): Promise<Metric[]> {
		return await db.query.metrics.findMany({
			where: eq(metrics.projectId, projectId)
		});
	}

	async getLatest(projectId: string): Promise<Metric | null> {
		const [latest] = await db.query.metrics.findMany({
			where: eq(metrics.projectId, projectId),
			orderBy: [desc(metrics.recordedAt)],
			limit: 1
		});
		return latest ?? null;
	}

	async getHistory(projectId: string, limit: number = 100): Promise<Metric[]> {
		return await db.query.metrics.findMany({
			where: eq(metrics.projectId, projectId),
			orderBy: [desc(metrics.recordedAt)],
			limit
		});
	}
}
