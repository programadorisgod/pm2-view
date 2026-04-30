import { json } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { createTeamRepository } from '$lib/db/repositories/team-repository.impl';
import { createTeamService } from '$lib/services/admin/team.service';
import { BetterAuthUserRepository } from '$lib/db/repositories/better-auth-user-repository.impl';
import { canManageTeam } from '$lib/server/team-access';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const addMemberSchema = z.object({
	email: z.string().email('Invalid email address'),
	role: z.enum(['team_member', 'team_admin']).default('team_member')
});

const updateRoleSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	role: z.enum(['team_member', 'team_admin'])
});

const removeMemberSchema = z.object({
	userId: z.string().min(1, 'User ID is required')
});

export const GET: RequestHandler = async ({ params }) => {
	const { id: teamId } = params;
	const teamRepo = createTeamRepository();
	const team = await teamRepo.findById(teamId) as any;

	if (!team) {
		return json({ error: 'Team not found' }, { status: 404 });
	}

	const members = (team.teamMembers ?? []).map(tm => ({
		userId: tm.userId,
		role: tm.role,
		joinedAt: tm.createdAt,
		user: tm.user
	}));

	return json({ members });
};

export const POST: RequestHandler = async ({ params, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id: teamId } = params;

	// Check permission
	const canManage = await canManageTeam(session.user.id, teamId);
	if (!canManage) {
		return json({ error: 'Access denied: Insufficient permissions' }, { status: 403 });
	}

	const body = await request.json();
	const result = addMemberSchema.safeParse(body);
	if (!result.success) {
		return json({ error: result.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 });
	}

	// Find user by email
	const targetUser = await new BetterAuthUserRepository().getUserByEmail(result.data.email);
	if (!targetUser) {
		return json({ error: 'User not found with that email' }, { status: 404 });
	}

	try {
		const teamService = createTeamService();
		await teamService.addMember(teamId, targetUser.id, result.data.role, session.user.id);
		return json({ success: true, message: 'Member added successfully' });
	} catch (e: any) {
		return json({ error: e.message ?? 'Failed to add member' }, { status: e.status ?? 500 });
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id: teamId } = params;

	const canManage = await canManageTeam(session.user.id, teamId);
	if (!canManage) {
		return json({ error: 'Access denied: Insufficient permissions' }, { status: 403 });
	}

	const body = await request.json();
	const result = updateRoleSchema.safeParse(body);
	if (!result.success) {
		return json({ error: result.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 });
	}

	try {
		const teamService = createTeamService();
		await teamService.updateMemberRole(teamId, result.data.userId, result.data.role, session.user.id);
		return json({ success: true, message: 'Role updated successfully' });
	} catch (e: any) {
		return json({ error: e.message ?? 'Failed to update role' }, { status: e.status ?? 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id: teamId } = params;

	const canManage = await canManageTeam(session.user.id, teamId);
	if (!canManage) {
		return json({ error: 'Access denied: Insufficient permissions' }, { status: 403 });
	}

	const body = await request.json();
	const result = removeMemberSchema.safeParse(body);
	if (!result.success) {
		return json({ error: result.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 });
	}

	try {
		const teamService = createTeamService();
		await teamService.removeMember(teamId, result.data.userId, session.user.id);
		return json({ success: true, message: 'Member removed successfully' });
	} catch (e: any) {
		return json({ error: e.message ?? 'Failed to remove member' }, { status: e.status ?? 500 });
	}
};
