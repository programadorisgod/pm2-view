import type { RequestHandler } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { AuthUser } from '$lib/auth/provider.interface';
import { error } from '@sveltejs/kit';
import { requireAdmin } from './route-guards';

/**
 * Type for the handler function passed to adminHandler
 * Receives the RequestEvent and the authenticated admin user
 */
type AdminHandlerFn = (event: RequestEvent, user: AuthUser) => Promise<Response>;

/**
 * Creates a SvelteKit RequestHandler that enforces admin authentication.
 * Checks that the user is authenticated and has admin role before calling the handler.
 *
 * @param handler - The handler function to wrap (receives event and authenticated admin user)
 * @returns A RequestHandler that enforces admin access
 *
 * @example
 * export const GET = adminHandler(async (event, user) => {
 *   // user is guaranteed to be authenticated and have admin role
 *   return json({ message: 'Hello admin!' });
 * });
 */
export function adminHandler(handler: AdminHandlerFn): RequestHandler {
	return async (event: RequestEvent) => {
		try {
			// Check if user is authenticated
			const user = event.locals.user;
			if (!user) {
				throw error(401, 'Unauthorized');
			}

			// Check if user has admin role
			requireAdmin(user);

			// Call the handler with the authenticated admin user
			return await handler(event, user);
		} catch (err) {
			// If it's already a SvelteKit error (has status), re-throw
			if (err && typeof err === 'object' && 'status' in err) {
				throw err;
			}
			// Otherwise, throw a 500 internal server error
			throw error(500, 'Internal server error');
		}
	};
}
