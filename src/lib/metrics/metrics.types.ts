import type { metrics } from '../db/schema';

export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;

export interface IMetricsRepository {
	record(metric: Omit<NewMetric, 'id' | 'recordedAt'>): Promise<Metric>;
	getByProjectId(projectId: string): Promise<Metric[]>;
	getLatest(projectId: string): Promise<Metric | null>;
	getHistory(projectId: string, limit?: number): Promise<Metric[]>;
}
