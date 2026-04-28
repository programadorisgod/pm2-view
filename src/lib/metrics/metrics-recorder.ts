import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { MetricsRepository } from '$lib/db/repositories/metrics-repository.impl';
import { MetricsService } from './metrics.service';

const pm2Repo = new PM2Repository();
const pm2Service = new PM2Service(pm2Repo);
const metricsRepo = new MetricsRepository();
const metricsService = new MetricsService(metricsRepo, pm2Service);

let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function startMetricsRecorder(intervalMs: number = 30000): void {
	if (isRunning) {
		console.log('Metrics recorder is already running');
		return;
	}

	console.log(`Starting metrics recorder (interval: ${intervalMs}ms)`);
	isRunning = true;

	// Record immediately on start
	recordMetrics();

	intervalId = setInterval(() => {
		recordMetrics();
	}, intervalMs);
}

export function stopMetricsRecorder(): void {
	if (!isRunning || !intervalId) {
		console.log('Metrics recorder is not running');
		return;
	}

	console.log('Stopping metrics recorder');
	clearInterval(intervalId);
	intervalId = null;
	isRunning = false;
}

export function isMetricsRecorderRunning(): boolean {
	return isRunning;
}

async function recordMetrics(): Promise<void> {
	try {
		const result = await metricsService.recordMetrics();
		if (result.success) {
			console.log(`[Metrics Recorder] ${result.message}`);
		} else {
			console.error(`[Metrics Recorder] Failed: ${result.message}`);
		}
	} catch (error) {
		console.error('[Metrics Recorder] Error recording metrics:', error);
	}
}
