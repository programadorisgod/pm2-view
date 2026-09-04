import 'dotenv/config';
import { auth } from '$lib/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { startMetricsEmitter, stopMetricsEmitter, startStatusWatcher, stopStatusWatcher } from '$lib/sse/server';
import { logger } from '$lib/logger';
import type { Handle } from '@sveltejs/kit';

declare global {
	var __pm2_cleanup: (() => void) | undefined;
}

if (!building) {
	if (globalThis.__pm2_cleanup) {
		globalThis.__pm2_cleanup();
	}

	startMetricsEmitter(10000);
	startStatusWatcher(10000);

	const handleSigterm = () => {
		logger.info('SIGTERM received, shutting down...');
		stopMetricsEmitter();
		stopStatusWatcher();
	};

	const handleSigint = () => {
		logger.info('SIGINT received, shutting down...');
		stopMetricsEmitter();
		stopStatusWatcher();
		process.exit(0);
	};

	process.on('SIGTERM', handleSigterm);
	process.on('SIGINT', handleSigint);

	globalThis.__pm2_cleanup = () => {
		stopMetricsEmitter();
		stopStatusWatcher();
		process.removeListener('SIGTERM', handleSigterm);
		process.removeListener('SIGINT', handleSigint);
	};
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
