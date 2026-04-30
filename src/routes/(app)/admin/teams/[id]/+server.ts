import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/route-guards';
import { logAudit } from '$lib/server/audit';
import { db } from '$lib/db';
import { teams, teamMembers, users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateTeamSchema = z.object({
	name: z.string().min(1, 'Team name is required').max(100, 'Team name too long').optional(),
	description: z.string().optional()
});

export const GET: RequestHandler = async ({ params, locals }) => {
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

	try {
		// Get team with members
		const team = await db.query.teams.findFirst({
			where: eq(teams.id, teamId),
			with: {
				teamMembers: {
					with: {
						user: {
							columns: { id: true, email: true, name: true, role: true }
						}
					}
				}
			}
		});

		if (!team) {
			throw error(404, 'Team not found');
		}

		// Format response
		const formattedTeam = {
			id: team.id,
			name: team.name,
			description: team.description,
			createdAt: team.createdAt,
			members: team.teamMembers.map(tm => ({
				userId: tm.userId,
				role: tm.role,
				joinedAt: tm.createdAt,
				user: tm.user
			}))
		};

		return json({ team: formattedTeam });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to get team:', e);
		throw error(500, 'Failed to retrieve team');
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
	const parseResult = updateTeamSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.errors[0].message);
	}

	const updates = parseResult.data;

	try {
		// Check if team exists
		const existingTeam = await db.query.teams.findFirst({
			where: eq(teams.id, teamId)
		});

		if (!existingTeam) {
			throw error(404, 'Team not found');
		}

		// Check for duplicate name if renaming
		if (updates.name && updates.name !== existingTeam.name) {
			const duplicateTeam = await db.query.teams.findFirst({
				where: eq(teams.name, updates.name)
			});

			if (duplicateTeam) {
				throw error(409, 'A team with this name already exists');
			}
		}

		// Update team
		const updateData: Record<string, any> = {};
		if (updates.name !== undefined) updateData.name = updates.name;
		if (updates.description !== undefined) updateData.description = updates.description;

		if (Object.keys(updateData).length > 0) {
			await db.update(teams)
				.set(updateData)
				.where(eq(teams.id, teamId));

			// Log the update
			await logAudit('team_update', user.id, undefined, 'team', teamId, {
				old: { name: existingTeam.name, description: existingTeam.description },
				new: updates
			});
		}

		// Return updated team
		const updatedTeam = await db.query.teams.findFirst({
			where: eq(teams.id, teamId)
		});

		return json({ team: updatedTeam });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to update team:', e);
		throw error(500, 'Failed to update team');
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
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

	try {
		// Check if team exists
		const team = await db.query.teams.findFirst({
			where: eq(teams.id, teamId)
		});

		if (!team) {
			throw error(404, 'Team not found');
		}

		// Delete all team members first (cascade should handle this, but being explicit)
		await db.delete(teamMembers)
			.where(eq(teamMembers.teamId, teamId));

		// Delete the team
		await db.delete(teams)
			.where(eq(teams.id, teamId));

		// Log the dissolution
		await logAudit('team_delete', user.id, undefined, 'team', teamId, {
			name: team.name
		});

		return json({ success: true });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to delete team:', e);
		throw error(500, 'Failed to delete team');
	}
};
