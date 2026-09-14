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
			const u = session.user as any;
			event.locals.user = {
				id: u.id,
				email: u.email,
				name: u.name ?? null,
				emailVerified: u.emailVerified ?? false,
				createdAt: u.createdAt ?? new Date(),
				role: u.role ?? 'user',
				banned: u.banned ?? false,
				banReason: u.banReason ?? null,
			};
			event.locals.session = session.session;
		}
	} catch {
		// No session or error — locals.user remains undefined
	}

	// 1. Strict defense-in-depth: Block public registration requests completely
	const pathname = event.url.pathname;
	if (pathname.startsWith('/api/auth/sign-up')) {
		return new Response(
			JSON.stringify({ error: 'Registration is disabled. Accounts can only be created by an administrator.' }),
			{ status: 403, headers: { 'Content-Type': 'application/json' } }
		);
	}

	// 2. Global Banned Account Lockout: banned users are rejected from all APIs and app pages
	if (event.locals.user?.banned) {
		if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/sign-out')) {
			return new Response(
				JSON.stringify({
					error: 'Forbidden: Account is banned',
					banReason: event.locals.user.banReason ?? 'Banned by administrator'
				}),
				{ status: 403, headers: { 'Content-Type': 'application/json' } }
			);
		}
		// If accessing web app pages (other than login / logout / auth endpoints)
		if (!pathname.startsWith('/login') && !pathname.startsWith('/api/auth')) {
			return new Response(null, {
				status: 303,
				headers: { Location: '/login?error=banned' }
			});
		}
	}

	// 3. Infrastructure & Admin endpoints protection
	const isProtectedAdminRoute =
		pathname.startsWith('/api/containers') ||
		pathname.startsWith('/api/images') ||
		pathname.startsWith('/api/networks') ||
		pathname.startsWith('/api/volumes') ||
		pathname.startsWith('/api/settings') ||
		pathname.startsWith('/api/watcher') ||
		pathname.startsWith('/api/status') ||
		pathname.startsWith('/api/nginx') ||
		pathname.startsWith('/api/ports') ||
		pathname.startsWith('/api/update') ||
		pathname.startsWith('/api/pm2') ||
		pathname.startsWith('/api/projects/register') ||
		pathname.startsWith('/admin');

	if (isProtectedAdminRoute) {
		if (!event.locals.user) {
			if (pathname.startsWith('/api/')) {
				return new Response(JSON.stringify({ error: 'Unauthorized: Inicie sesión para acceder a estos recursos.' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			return new Response(null, {
				status: 303,
				headers: { Location: '/login' }
			});
		}
		if (event.locals.user.role !== 'admin') {
			if (pathname.startsWith('/api/')) {
				return new Response(JSON.stringify({ error: 'Forbidden: Admin role required' }), {
					status: 403,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			return new Response(JSON.stringify({ error: 'Forbidden: Admin role required' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
