import { requireAdmin } from '$lib/server/route-guards';
import { createTeamService } from '$lib/services/admin/team.service';
import { BetterAuthUserRepository } from '$lib/db/repositories/better-auth-user-repository.impl';
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
		const teamService = createTeamService();
		const result = await teamService.listTeams({ page, limit });

		// Load all users for member selection
		const authRepo = new BetterAuthUserRepository();
		const allUsersResult = await authRepo.listUsers({ limit: 1000, offset: 0 });
		const availableUsers = allUsersResult.users.map(u => ({
			id: u.id,
			email: u.email,
			name: u.name
		}));

		return {
			teams: result.teams,
			pagination: result.pagination,
			availableUsers
		};
	} catch (e) {
		console.error('Failed to load teams:', e);
		throw error(500, 'Failed to retrieve teams');
	}
};
