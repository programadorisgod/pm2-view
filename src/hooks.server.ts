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

	// Reject banned users from protected API endpoints and app pages (allow sign-out/auth routes)
	if (
		event.locals.user?.banned &&
		!event.url.pathname.startsWith('/api/auth') &&
		!event.url.pathname.startsWith('/login') &&
		!event.url.pathname.startsWith('/logout')
	) {
		if (event.url.pathname.startsWith('/api')) {
			return new Response(JSON.stringify({ error: 'Account is banned' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	const response = await svelteKitHandler({ event, resolve, auth, building });

	// Apply OWASP A05 Security Headers
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

	if (process.env.NODE_ENV === 'production') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	if (!response.headers.has('Content-Security-Policy')) {
		response.headers.set(
			'Content-Security-Policy',
			"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' ws: wss:; frame-ancestors 'none';"
		);
	}

	return response;
};

