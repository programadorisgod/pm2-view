import { sseManager } from './sse-manager';
import { createServices } from '$lib/services/factory';
import { logger } from '$lib/logger';

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startMetricsEmitter(intervalMs: number = 10000): void {
	if (intervalId) return;

	intervalId = setInterval(async () => {
		try {
			const { pm2Service } = createServices();
			const processes = await pm2Service.getAllProcesses();

			for (const process of processes) {
				sseManager.emit('metrics', {
					processId: process.pm_id.toString(),
					processName: process.name,
					cpu: process.monit?.cpu ?? 0,
					memoryMB: Math.round((process.monit?.memory ?? 0) / 1024 / 1024),
					status: process.pm2_env?.status ?? 'unknown',
				});
			}
		} catch (error) {
			logger.error('Failed to emit metrics via SSE', { error: String(error) });
		}
	}, intervalMs);

	logger.info('SSE metrics emitter started', { intervalMs });
}

export function stopMetricsEmitter(): void {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
		logger.info('SSE metrics emitter stopped');
	}
}
