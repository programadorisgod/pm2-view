import { createTeamRepository } from '$lib/db/repositories/team-repository.impl';
import { auth } from '$lib/auth';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { id: teamId } = params;

	const teamRepo = createTeamRepository();
	const team = await teamRepo.findById(teamId) as any;

	if (!team) {
		throw error(404, 'Team not found');
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
		members
	};
};
