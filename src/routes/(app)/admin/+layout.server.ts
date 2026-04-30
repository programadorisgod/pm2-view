import { requireAdmin } from '$lib/server/route-guards';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Parent layout already handles auth, just verify admin role
	if (!locals.user) {
		return { user: null, isAdmin: false };
	}

	// Don't throw here - let individual pages handle their own access
	// This allows the layout to render even if user is not admin
	// Individual pages will use requireAdmin() for their specific routes
	return {
		user: locals.user,
		isAdmin: locals.user.role === 'admin'
	};
};
