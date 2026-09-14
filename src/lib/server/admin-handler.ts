import type { RequestHandler } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { AuthUser } from '$lib/auth/provider.interface';
import { error } from '@sveltejs/kit';
import { requireAdmin } from './route-guards';
import { logger } from '$lib/logger';

type AdminHandlerFn = (event: RequestEvent, user: AuthUser) => Promise<Response>;

export function adminHandler(handler: AdminHandlerFn): RequestHandler {
	return async (event: RequestEvent) => {
		try {
			const user = event.locals.user;
			if (!user) {
				throw error(401, 'Unauthorized');
			}

			requireAdmin(user);

			return await handler(event, user);
		} catch (err: any) {
			// If it's already a SvelteKit error (has numeric status), re-throw
			if (err && typeof err === 'object' && 'status' in err && typeof err.status === 'number') {
				throw err;
			}
			// If it's a Better Auth APIError or similar (has statusCode), re-throw as SvelteKit error
			if (err && typeof err === 'object' && 'statusCode' in err && typeof err.statusCode === 'number') {
				const status = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 400;
				const message = err.body?.message || err.message || 'Request failed';
				throw error(status, message);
			}
			// Log the actual error before throwing generic 500
			const errorDetails = err instanceof Error
				? { message: err.message, stack: err.stack, name: err.name }
				: { raw: err };
			logger.error('adminHandler error:', errorDetails);
			throw error(500, err instanceof Error ? err.message : 'Internal server error');
		}
	};
}
