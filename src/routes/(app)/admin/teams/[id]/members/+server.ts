import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/route-guards';
import { logAudit } from '$lib/server/audit';
import { db } from '$lib/db';
import { teamMembers, teams, users } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const addMemberSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	role: z.enum(['team_owner', 'team_admin', 'team_member']).default('team_member')
});

const updateMemberSchema = z.object({
	role: z.enum(['team_owner', 'team_admin', 'team_member'])
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Check admin access
	requireAdmin(user);

	const teamId = params.id;
	if (!teamId) {
		throw error(400, 'Team ID is required');
	}

	// Validate request body
	const body = await request.json();
	const parseResult = addMemberSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.errors[0].message);
	}

	const { userId, role } = parseResult.data;

	try {
		// Check if team exists
		const team = await db.query.teams.findFirst({
			where: eq(teams.id, teamId)
		});

		if (!team) {
			throw error(404, 'Team not found');
		}

		// Check if user exists
		const targetUser = await db.query.users.findFirst({
			where: eq(users.id, userId)
		});

		if (!targetUser) {
			throw error(404, 'User not found');
		}

		// Check if user is already a member
		const existingMember = await db.query.teamMembers.findFirst({
			where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
		});

		if (existingMember) {
			throw error(409, 'User is already a member of this team');
		}

		// Add member
		const memberId = crypto.randomUUID();
		await db.insert(teamMembers).values({
			id: memberId,
			teamId,
			userId,
			role,
			createdAt: new Date()
		});

		// Log the action
		await logAudit('team_member_add', user.id, userId, 'team', teamId, {
			teamName: team.name,
			role
		});

		return json({
			member: {
				id: memberId,
				teamId,
				userId,
				role,
				createdAt: new Date()
			}
		}, { status: 201 });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to add team member:', e);
		throw error(500, 'Failed to add team member');
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Check admin access
	requireAdmin(user);

	const teamId = params.id;
	if (!teamId) {
		throw error(400, 'Team ID is required');
	}

	// Validate request body
	const body = await request.json();
	const { userId, role } = body;

	if (!userId || !role) {
		throw error(400, 'userId and role are required');
	}

	const parseResult = updateMemberSchema.safeParse({ role });
	if (!parseResult.success) {
		throw error(400, parseResult.error.errors[0].message);
	}

	try {
		// Check if team exists
		const team = await db.query.teams.findFirst({
			where: eq(teams.id, teamId)
		});

		if (!team) {
			throw error(404, 'Team not found');
		}

		// Check if member exists
		const existingMember = await db.query.teamMembers.findFirst({
			where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
		});

		if (!existingMember) {
			throw error(404, 'Team member not found');
		}

		// Check if trying to demote the last team_owner
		if (existingMember.role === 'team_owner' && role !== 'team_owner') {
			const ownerCount = await db.select({ count: db.$count() })
				.from(teamMembers)
				.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'team_owner')));

			if (ownerCount[0]?.count <= 1) {
				throw error(403, 'Cannot demote the last team owner');
			}
		}

		// Update member role
		await db.update(teamMembers)
			.set({ role })
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

		// Log the action
		await logAudit('team_member_role_change', user.id, userId, 'team', teamId, {
			from: existingMember.role,
			to: role
		});

		return json({ success: true });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to update team member:', e);
		throw error(500, 'Failed to update team member');
	}
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Check admin access
	requireAdmin(user);

	const teamId = params.id;
	if (!teamId) {
		throw error(400, 'Team ID is required');
	}

	const url = new URL(request.url);
	const userId = url.searchParams.get('userId');

	if (!userId) {
		throw error(400, 'userId query parameter is required');
	}

	try {
		// Check if team exists
		const team = await db.query.teams.findFirst({
			where: eq(teams.id, teamId)
		});

		if (!team) {
			throw error(404, 'Team not found');
		}

		// Check if member exists
		const existingMember = await db.query.teamMembers.findFirst({
			where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
		});

		if (!existingMember) {
			throw error(404, 'Team member not found');
		}

		// Check if trying to remove the last team_owner
		if (existingMember.role === 'team_owner') {
			const ownerCount = await db.select({ count: db.$count() })
				.from(teamMembers)
				.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'team_owner')));

			if (ownerCount[0]?.count <= 1) {
				throw error(403, 'Cannot remove the last team owner');
			}
		}

		// Remove member
		await db.delete(teamMembers)
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

		// Log the action
		await logAudit('team_member_remove', user.id, userId, 'team', teamId, {
			teamName: team.name,
			role: existingMember.role
		});

		return json({ success: true });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to remove team member:', e);
		throw error(500, 'Failed to remove team member');
	}
};
