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
	// Populate locals.user from session before svelteKitHandler processes
	// This makes user available to all +layout.server.ts and +page.server.ts via event.locals
	try {
		const session = await auth.api.getSession({
			headers: event.request.headers
		});
		if (session) {
			event.locals.user = {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name ?? null,
				emailVerified: session.user.emailVerified ?? false,
				createdAt: session.user.createdAt ?? new Date(),
				role: session.user.role ?? 'user',
				banned: session.user.banned ?? false,
				banReason: session.user.banReason ?? null,
			};
			event.locals.session = session.session;
		}
	} catch {
		// No session or error — locals.user remains undefined
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
