import { json, error } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createTeamService } from '$lib/services/admin/team.service';
import { createTeamRepository } from '$lib/db/repositories/team-repository.impl';
import { addTeamMemberSchema, updateTeamMemberSchema } from '$lib/validation/team-schemas';

const teamService = createTeamService();

export const GET = adminHandler(async ({ params }) => {
	const teamId = params.id;
	if (!teamId) {
		throw new Error('Team ID is required');
	}

	const teamRepo = createTeamRepository();
	const team = await teamRepo.findById(teamId) as any;
	if (!team) {
		throw error(404, 'Team not found');
	}

	const members = (team.teamMembers ?? []).map((tm: any) => ({
		userId: tm.userId,
		role: tm.role,
		joinedAt: tm.createdAt,
		user: tm.user
	}));

	return json({ members });
});

export const POST = adminHandler(async ({ params, request }, user) => {
	const teamId = params.id;
	if (!teamId) {
		throw new Error('Team ID is required');
	}

	const body = await request.json();
	const parseResult = addTeamMemberSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	await teamService.addMember(teamId, parseResult.data.userId, parseResult.data.role, user.id);
	return json({ success: true }, { status: 201 });
});

export const PATCH = adminHandler(async ({ params, request }, user) => {
	const teamId = params.id;
	if (!teamId) {
		throw new Error('Team ID is required');
	}

	const body = await request.json();
	const { userId, role } = body;

	if (!userId || !role) {
		throw new Error('userId and role are required');
	}

	const parseResult = updateTeamMemberSchema.safeParse({ role });
	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	await teamService.updateMemberRole(teamId, userId, role, user.id);
	return json({ success: true });
});

export const DELETE = adminHandler(async ({ params, request }, user) => {
	const teamId = params.id;
	if (!teamId) {
		throw new Error('Team ID is required');
	}

	const url = new URL(request.url);
	const userId = url.searchParams.get('userId');

	if (!userId) {
		throw new Error('userId query parameter is required');
	}

	await teamService.removeMember(teamId, userId, user.id);
	return json({ success: true });
});
