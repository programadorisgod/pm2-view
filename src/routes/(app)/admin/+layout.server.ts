import { requireAdmin } from '$lib/server/route-guards';
import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Parent layout already handles auth check (session exists)
	// This layout MUST enforce admin role
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Explicitly check admin role - throw 403 if not admin
	requireAdmin(locals.user);

	// User is authenticated and is an admin
	return {
		user: locals.user,
		isAdmin: true
	};
};
