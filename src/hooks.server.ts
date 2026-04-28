import { auth } from '$lib/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { startMetricsRecorder, stopMetricsRecorder } from '$lib/metrics/metrics-recorder';
import type { Handle } from '@sveltejs/kit';

// Start metrics recorder on server startup (only in production/development, not during build)
if (!building) {
	startMetricsRecorder(30000); // Record metrics every 30 seconds

	// Handle graceful shutdown
	process.on('SIGTERM', () => {
		console.log('SIGTERM received, stopping metrics recorder...');
		stopMetricsRecorder();
	});

	process.on('SIGINT', () => {
		console.log('SIGINT received, stopping metrics recorder...');
		stopMetricsRecorder();
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	return svelteKitHandler({ event, resolve, auth, building });
};
