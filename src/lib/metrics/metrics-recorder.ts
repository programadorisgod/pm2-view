import { createServices } from '$lib/services/factory';
import { logger } from '$lib/logger';

let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function startMetricsRecorder(intervalMs: number = 30000): void {
	if (isRunning) {
		logger.info('Metrics recorder is already running');
		return;
	}

	logger.info(`Starting metrics recorder (interval: ${intervalMs}ms)`);
	isRunning = true;

	// Record immediately on start
	recordMetrics();

	intervalId = setInterval(() => {
		recordMetrics();
	}, intervalMs);
}

export function stopMetricsRecorder(): void {
	if (!isRunning || !intervalId) {
		logger.info('Metrics recorder is not running');
		return;
	}

	logger.info('Stopping metrics recorder');
	clearInterval(intervalId);
	intervalId = null;
	isRunning = false;
}

export function isMetricsRecorderRunning(): boolean {
	return isRunning;
}

async function recordMetrics(): Promise<void> {
	try {
		const { metricsService } = createServices();
		const result = await metricsService.recordMetrics();
		if (result.success) {
			logger.info(`[Metrics Recorder] ${result.message}`);
		} else {
			logger.error(`[Metrics Recorder] Failed: ${result.message}`);
		}
	} catch (error) {
		logger.error('[Metrics Recorder] Error recording metrics:', { error: String(error) });
	}
}
