import { sseManager } from './sse-manager';
import { createServices } from '$lib/services/factory';
import { logger } from '$lib/logger';

let previousStatuses = new Map<string, string>();
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startStatusWatcher(intervalMs: number = 5000): void {
	if (intervalId) return;

	intervalId = setInterval(async () => {
		try {
			const { pm2Service } = createServices();
			const processes = await pm2Service.getAllProcesses();

			for (const process of processes) {
				const id = process.pm_id.toString();
				const currentStatus = process.pm2_env?.status ?? 'unknown';
				const previousStatus = previousStatuses.get(id);

				if (previousStatus && previousStatus !== currentStatus) {
					sseManager.emit('process-status', {
						processId: id,
						processName: process.name,
						status: currentStatus,
						previousStatus,
					});
				}

				previousStatuses.set(id, currentStatus);
			}
		} catch (error) {
			logger.error('Failed to watch process statuses via SSE', { error: String(error) });
		}
	}, intervalMs);

	logger.info('SSE status watcher started', { intervalMs });
}

export function stopStatusWatcher(): void {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
		previousStatuses.clear();
		logger.info('SSE status watcher stopped');
	}
}
