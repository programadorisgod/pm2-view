import { requireAdmin } from '$lib/server/route-guards';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
	requireAdmin(locals.user);
	return {};
};
