import type { Metric, NewMetric, IMetricsRepository } from './metrics.types';
import type { ProcessWithStatus } from '$lib/pm2/pm2.types';
import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { db } from '$lib/db/db';
import { metrics } from '$lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '$lib/logger';

export interface MetricsSummary {
	totalCpu: number;
	totalRam: number;
	avgUptime: string;
	processesRunning: number;
	totalProcesses: number;
}

export class MetricsService {
	private repository: IMetricsRepository;
	private pm2Service: PM2Service;

	constructor(repository: IMetricsRepository, pm2Service: PM2Service) {
		this.repository = repository;
		this.pm2Service = pm2Service;
	}

	async getLatestMetrics(): Promise<Metric[]> {
		try {
			const processes = await this.pm2Service.getAllProcesses();
			const latestMetrics: Metric[] = [];

			for (const process of processes) {
				const project = await this.findProjectByPm2Name(process.name);
				if (project) {
					const latest = await this.repository.getLatest(project.id);
					if (latest) {
						latestMetrics.push(latest);
					}
				}
			}

			return latestMetrics;
		} catch (error) {
			logger.error('Failed to get latest metrics:', { error: String(error) });
			return [];
		}
	}

	async getMetricsHistory(processId: string, hours: number = 24): Promise<Metric[]> {
		try {
			const since = new Date();
			since.setHours(since.getHours() - hours);

			const result = await this.repository.getHistory(processId, { limit: 1000 });
			const allMetrics = Array.isArray(result) ? result : result.data;
			return allMetrics.filter((m) => m.recordedAt && m.recordedAt >= since);
		} catch (error) {
			logger.error(`Failed to get metrics history for ${processId}:`, { error: String(error) });
			return [];
		}
	}

	async recordMetrics(): Promise<{ success: boolean; message: string; recorded: number }> {
		try {
			const processes = await this.pm2Service.getAllProcesses();
			let recorded = 0;

			for (const process of processes) {
				const project = await this.findProjectByPm2Name(process.name);
				if (!project) continue;

				const metric: Omit<NewMetric, 'id' | 'recordedAt'> = {
					projectId: project.id,
					cpu: process.cpu,
					memory: process.monit?.memory ?? 0,
					uptime: process.pm2_env?.pm_uptime ? Date.now() - process.pm2_env.pm_uptime : 0,
					status: process.status
				};

				await this.repository.record(metric);
				recorded++;
			}

			return {
				success: true,
				message: `Recorded metrics for ${recorded} processes`,
				recorded
			};
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : 'Failed to record metrics',
				recorded: 0
			};
		}
	}

	async getAggregatedMetrics(): Promise<MetricsSummary> {
		try {
			const processes = await this.pm2Service.getAllProcesses();

			if (processes.length === 0) {
				return {
					totalCpu: 0,
					totalRam: 0,
					avgUptime: 'N/A',
					processesRunning: 0,
					totalProcesses: 0
				};
			}

			const totalCpu = processes.reduce((sum, p) => sum + (p.cpu || 0), 0);
			const totalRam = processes.reduce((sum, p) => sum + (p.monit?.memory || 0), 0);
			const running = processes.filter((p) => p.status === 'online').length;

			const uptimes = processes
				.filter((p) => p.pm2_env?.pm_uptime)
				.map((p) => Date.now() - p.pm2_env.pm_uptime);

			const avgUptimeMs = uptimes.length > 0 ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length : 0;

			return {
				totalCpu,
				totalRam,
				avgUptime: this.formatUptime(avgUptimeMs),
				processesRunning: running,
				totalProcesses: processes.length
			};
		} catch (error) {
			logger.error('Failed to get aggregated metrics:', { error: String(error) });
			return {
				totalCpu: 0,
				totalRam: 0,
				avgUptime: 'N/A',
				processesRunning: 0,
				totalProcesses: 0
			};
		}
	}

	async getCurrentProcessesWithMetrics(): Promise<ProcessWithStatus[]> {
		return await this.pm2Service.getAllProcesses();
	}

	private async findProjectByPm2Name(pm2Name: string) {
		const { projects } = await import('$lib/db/schema');
		const [project] = await db
			.select()
			.from(projects)
			.where(eq(projects.pm2Name, pm2Name))
			.limit(1);
		return project ?? null;
	}

	private formatUptime(uptimeMs: number): string {
		if (!uptimeMs || uptimeMs <= 0) return 'N/A';

		const seconds = Math.floor(uptimeMs / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ${hours % 24}h`;
		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
		return `${seconds}s`;
	}
}
