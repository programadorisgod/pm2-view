import { json, error } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createTeamService } from '$lib/services/admin/team.service';
import { updateTeamSchema } from '$lib/validation/team-schemas';

const teamService = createTeamService();

export const GET = adminHandler(async ({ params }) => {
	const teamId = params.id;
	if (!teamId) {
		throw new Error('Team ID is required');
	}

	const team = await teamService.getTeam(teamId);
	if (!team) {
		throw new Error('Team not found');
	}

	return json({ team });
});

export const PATCH = adminHandler(async ({ params, request }, user) => {
	const teamId = params.id;
	if (!teamId) {
		throw new Error('Team ID is required');
	}

	const body = await request.json();
	const parseResult = updateTeamSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	const updatedTeam = await teamService.updateTeam(teamId, parseResult.data, user.id);
	return json({ team: updatedTeam });
});

export const DELETE = adminHandler(async ({ params }, user) => {
	const teamId = params.id;
	if (!teamId) {
		throw new Error('Team ID is required');
	}

	await teamService.deleteTeam(teamId, user.id);
	return json({ success: true });
});
