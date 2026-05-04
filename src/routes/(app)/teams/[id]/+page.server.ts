import { createTeamRepository } from '$lib/db/repositories/team-repository.impl';
import { auth } from '$lib/auth';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, request }) => {
	const session = await auth.api.getSession({
		headers: request.headers
	});

	if (!session?.user) {
		throw error(401, 'Unauthorized');
	}

	const { id: teamId } = params;

	const teamRepo = createTeamRepository();
	const team = await teamRepo.findById(teamId) as any;

	if (!team) {
		throw error(404, 'Team not found');
	}

	// Check if user is a member of this team
	const userMembership = team.teamMembers?.find((m: any) => m.userId === session.user.id);
	if (!userMembership) {
		throw error(403, 'You are not a member of this team');
	}

	const members = team.teamMembers?.map(tm => ({
		userId: tm.userId,
		role: tm.role,
		joinedAt: tm.createdAt,
		user: tm.user
	})) ?? [];

	return {
		team: {
			id: team.id,
			name: team.name,
			description: team.description,
			createdAt: team.createdAt
		},
		members,
		userRole: userMembership.role
	};
};

export const actions: Actions = {
	leaveTeam: async ({ params, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const { id: teamId } = params;
		const teamRepo = createTeamRepository();

		// Check if user is a member
		const member = await teamRepo.findMember(teamId, locals.user.id);
		if (!member) {
			return fail(404, { error: 'You are not a member of this team' });
		}

		// Don't allow last owner to leave
		if (member.role === 'team_owner') {
			const ownerCount = await teamRepo.countOwners(teamId);
			if (ownerCount <= 1) {
				return fail(409, { error: 'Cannot leave: you are the last owner. Transfer ownership first or delete the team.' });
			}
		}

		try {
			await teamRepo.removeMember(teamId, locals.user.id);
			return { success: true, message: 'Left team successfully' };
		} catch (e: any) {
			console.error(`[leaveTeam] Error leaving team ${teamId}:`, e);
			return fail(500, { error: e.message || 'Failed to leave team' });
		}
	}
};
