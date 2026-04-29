import { auth } from '$lib/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { startMetricsRecorder, stopMetricsRecorder } from '$lib/metrics/metrics-recorder';
import { startMetricsEmitter, stopMetricsEmitter, startStatusWatcher, stopStatusWatcher } from '$lib/sse/server';
import { logger } from '$lib/logger';
import type { Handle } from '@sveltejs/kit';

if (!building) {
	startMetricsRecorder(30000);
	startMetricsEmitter(10000);
	startStatusWatcher(5000);

	process.on('SIGTERM', () => {
		logger.info('SIGTERM received, shutting down...');
		stopMetricsRecorder();
		stopMetricsEmitter();
		stopStatusWatcher();
	});

	process.on('SIGINT', () => {
		logger.info('SIGINT received, shutting down...');
		stopMetricsRecorder();
		stopMetricsEmitter();
		stopStatusWatcher();
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	return svelteKitHandler({ event, resolve, auth, building });
};
