import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/route-guards';
import { logAudit } from '$lib/server/audit';
import { db } from '$lib/db';
import { teams, teamMembers } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const createTeamSchema = z.object({
	name: z.string().min(1, 'Team name is required').max(100, 'Team name too long'),
	description: z.string().optional()
});

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Check admin access
	requireAdmin(user);

	// Parse pagination parameters
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '20', 10);
	const offset = (page - 1) * limit;

	try {
		// Get teams with member counts
		const teamsList = await db.query.teams.findMany({
			limit,
			offset,
			orderBy: (teams, { desc }) => [desc(teams.createdAt)],
			with: {
				teamMembers: {
					columns: { userId: true, role: true }
				}
			}
		});

		// Get total count
		const totalResult = await db.select({ count: db.$count(teams) }).from(teams);
		const total = totalResult[0]?.count || 0;

		// Format response with member counts
		const formattedTeams = teamsList.map(team => ({
			id: team.id,
			name: team.name,
			description: team.description,
			createdAt: team.createdAt,
			memberCount: team.teamMembers.length
		}));

		return json({
			teams: formattedTeams,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit)
			}
		});
	} catch (e) {
		console.error('Failed to list teams:', e);
		throw error(500, 'Failed to retrieve teams');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Check admin access
	requireAdmin(user);

	// Validate request body
	const body = await request.json();
	const parseResult = createTeamSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.errors[0].message);
	}

	const { name, description } = parseResult.data;

	try {
		// Check for duplicate team name
		const existingTeam = await db.query.teams.findFirst({
			where: eq(teams.name, name)
		});

		if (existingTeam) {
			throw error(409, 'A team with this name already exists');
		}

		// Create team
		const teamId = crypto.randomUUID();
		const newTeam = {
			id: teamId,
			name,
			description: description || null,
			createdAt: new Date()
		};

		await db.insert(teams).values(newTeam);

		// Log the team creation
		await logAudit('team_create', user.id, undefined, 'team', teamId, {
			name,
			description
		});

		return json({ team: newTeam }, { status: 201 });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to create team:', e);
		throw error(500, 'Failed to create team');
	}
};
