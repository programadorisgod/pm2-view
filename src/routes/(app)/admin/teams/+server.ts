import { json, error } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createTeamService } from '$lib/services/admin/team.service';
import { listTeamsQuerySchema, createTeamSchema } from '$lib/validation/team-schemas';

const teamService = createTeamService();

export const GET = adminHandler(async ({ url }) => {
	const parseResult = listTeamsQuerySchema.safeParse({
		page: url.searchParams.get('page'),
		limit: url.searchParams.get('limit')
	});

	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	const result = await teamService.listTeams(parseResult.data);
	return json(result);
});

export const POST = adminHandler(async ({ request }, user) => {
	const body = await request.json();
	const parseResult = createTeamSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	const team = await teamService.createTeam(parseResult.data, user.id);
	return json({ team }, { status: 201 });
});
