import 'dotenv/config';
import { auth } from '$lib/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { startMetricsEmitter, stopMetricsEmitter, startStatusWatcher, stopStatusWatcher } from '$lib/sse/server';
import { logger } from '$lib/logger';
import type { Handle } from '@sveltejs/kit';

import { watcher } from '$lib/server/containers/runtime';

if (!building) {
	startMetricsEmitter(10000);
	startStatusWatcher(10000);

	process.on('SIGTERM', () => {
		logger.info('SIGTERM received, shutting down...');
		stopMetricsEmitter();
		stopStatusWatcher();
		watcher.stop();
	});

	process.on('SIGINT', () => {
		logger.info('SIGINT received, shutting down...');
		stopMetricsEmitter();
		stopStatusWatcher();
		watcher.stop();
		process.exit(0);
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

	// Enforce authentication for container operational API endpoints
	const pathname = event.url.pathname;
	const isProtectedApi =
		pathname.startsWith('/api/containers') ||
		pathname.startsWith('/api/images') ||
		pathname.startsWith('/api/networks') ||
		pathname.startsWith('/api/volumes') ||
		pathname.startsWith('/api/settings') ||
		pathname.startsWith('/api/watcher') ||
		pathname.startsWith('/api/status');

	if (isProtectedApi && !event.locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized: Inicie sesión para acceder a estos recursos.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
