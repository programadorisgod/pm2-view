import { requireAdmin } from '$lib/server/route-guards';
import { db } from '$lib/db';
import { teams, teamMembers } from '$lib/db/schema';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	requireAdmin(locals.user);

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '20', 10);
	const offset = (page - 1) * limit;

	try {
		const teamsList = await db.query.teams.findMany({
			limit,
			offset,
			with: {
				teamMembers: {
					with: {
						user: { columns: { id: true, email: true, name: true, role: true } }
					}
				}
			}
		});

		const formattedTeams = teamsList.map(team => ({
			id: team.id,
			name: team.name,
			description: team.description,
			createdAt: team.createdAt,
			memberCount: team.teamMembers.length,
			members: team.teamMembers.map(tm => ({
				userId: tm.userId,
				role: tm.role,
				joinedAt: tm.createdAt,
				user: tm.user
			}))
		}));

		return { teams: formattedTeams };
	} catch (e) {
		console.error('Failed to load teams:', e);
		throw error(500, 'Failed to retrieve teams');
	}
};
