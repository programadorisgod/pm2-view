import { requireAdmin } from '$lib/server/route-guards';
import { auth } from '$lib/auth';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	requireAdmin(locals.user);

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '20', 10);
	const offset = (page - 1) * limit;

	try {
		const result = await auth.api.listUsers({
			headers: request.headers,
			query: { limit, offset }
		});

		return {
			users: result.users || [],
			pagination: {
				page,
				limit,
				total: result.total || 0,
				totalPages: Math.ceil((result.total || 0) / limit)
			}
		};
	} catch (e) {
		console.error('Failed to list users:', e);
		throw error(500, 'Failed to retrieve users');
	}
};
