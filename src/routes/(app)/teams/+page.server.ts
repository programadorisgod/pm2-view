import { createTeamRepository } from '$lib/db/repositories/team-repository.impl';
import { createTeamService } from '$lib/services/admin/team.service';
import { auth } from '$lib/auth';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	if (!session?.user) {
		throw error(401, 'Unauthorized');
	}

	const teamRepo = createTeamRepository();
	const teams = await teamRepo.getUserTeams(session.user.id);

	// Enrich with member counts and user's role
	const enrichedTeams = await Promise.all(
		teams.map(async (team) => {
			const fullTeam = await teamRepo.findById(team.id) as any;
			const members = fullTeam?.teamMembers ?? [];
			return {
				id: team.id,
				name: team.name,
				description: team.description,
				createdAt: team.createdAt,
				memberCount: members.length,
				userRole: members.find((m: any) => m.userId === session.user.id)?.role ?? 'team_member'
			};
		})
	);

	return {
		teams: enrichedTeams,
		user: session.user
	};
};

export const actions: Actions = {
	joinTeam: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const teamId = formData.get('teamId') as string;

		if (!teamId || !teamId.trim()) {
			return fail(400, { error: 'Team ID is required' });
		}

		const teamRepo = createTeamRepository();
		const team = await teamRepo.findById(teamId) as any;

		if (!team) {
			return fail(404, { error: 'Team not found' });
		}

		// Check if already a member
		const existingMember = team.teamMembers?.find((m: any) => m.userId === locals.user.id);
		if (existingMember) {
			return fail(409, { error: 'You are already a member of this team' });
		}

		try {
			const teamService = createTeamService();
			await teamService.addMember(teamId, locals.user.id, 'team_member', locals.user.id);
			return { success: true, message: 'Joined team successfully' };
		} catch (e: any) {
			return fail(e.status ?? 500, { error: e.message ?? 'Failed to join team' });
		}
	}
};
