import type { ProcessWithStatus } from '$lib/pm2/pm2.types';
import { PM2Service } from '$lib/pm2/pm2.service';
import { logger } from '$lib/logger';

export interface MetricsSummary {
	totalCpu: number;
	totalRam: number;
	avgUptime: string;
	processesRunning: number;
	totalProcesses: number;
}

export class MetricsService {
	private pm2Service: PM2Service;

	constructor(pm2Service: PM2Service) {
		this.pm2Service = pm2Service;
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
