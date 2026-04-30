import { requireAdmin } from '$lib/server/route-guards';
import { createUserService } from '$lib/services/admin/user.service';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	requireAdmin(locals.user);

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '20', 10);

	try {
		const userService = createUserService();
		const result = await userService.listUsers({ page, limit });

		return result;
	} catch (e) {
		console.error('Failed to list users:', e);
		throw error(500, 'Failed to retrieve users');
	}
};
