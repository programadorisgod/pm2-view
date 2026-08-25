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
		} catch (err) {
			// If it's already a SvelteKit error (has status), re-throw
			if (err && typeof err === 'object' && 'status' in err) {
				throw err;
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
