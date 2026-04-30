import { json } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createTeamService } from '$lib/services/admin/team.service';

const teamService = createTeamService();

export const GET = adminHandler(async ({ params }) => {
	const teamId = params.id;
	const userId = params.userId;

	if (!teamId || !userId) {
		throw new Error('Team ID and User ID are required');
	}

	const member = await teamService.getMember(teamId, userId);
	if (!member) {
		throw new Error('Team member not found');
	}

	return json(member);
});

export const DELETE = adminHandler(async ({ params }, user) => {
	const teamId = params.id;
	const userId = params.userId;

	if (!teamId || !userId) {
		throw new Error('Team ID and User ID are required');
	}

	await teamService.removeMember(teamId, userId, user.id);
	return json({ success: true }, { status: 204 });
});
