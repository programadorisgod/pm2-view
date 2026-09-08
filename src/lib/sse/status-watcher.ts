import { sseManager } from './sse-manager';
import { createServices } from '$lib/services/factory';
import { logger } from '$lib/logger';
import { mapStatus } from '$lib/pm2/pm2.service';
import { createDefaultProcessAlertNotifier } from '$lib/notifications/process-alert-notifier';

let previousStatuses = new Map<string, string>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let alertNotifier: ReturnType<typeof createDefaultProcessAlertNotifier> | null = null;

export function startStatusWatcher(intervalMs: number = 5000): void {
	if (intervalId) return;

	alertNotifier = createDefaultProcessAlertNotifier();

	intervalId = setInterval(async () => {
		try {
			const { pm2Service } = createServices();
			const processes = await pm2Service.getAllProcesses();

			const currentIds = new Set<string>();

			for (const process of processes) {
				const id = process.pm_id.toString();
				currentIds.add(id);
				const currentStatus = process.pm2_env?.status ?? 'unknown';
				const previousStatus = previousStatuses.get(id);

				if (previousStatus && previousStatus !== currentStatus) {
					sseManager.emit('process-status', {
						processId: id,
						processName: process.name,
						status: currentStatus,
						previousStatus
					});

					const mappedCurrentStatus = mapStatus(currentStatus, process.pm2_env?.exit_code, process.pm2_env?.autorestart);
					const mappedPreviousStatus = mapStatus(previousStatus);

					if (mappedCurrentStatus === 'error' && mappedPreviousStatus !== 'error' && alertNotifier) {
						alertNotifier.notifyProcessError(process.name, previousStatus).catch((err) => {
							logger.error('Failed to send process error alert', {
								processName: process.name,
								error: String(err)
							});
						});
					}
				}

				previousStatuses.set(id, currentStatus);
			}

			// Clean up stale IDs for processes that no longer exist
			for (const id of previousStatuses.keys()) {
				if (!currentIds.has(id)) {
					previousStatuses.delete(id);
				}
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
