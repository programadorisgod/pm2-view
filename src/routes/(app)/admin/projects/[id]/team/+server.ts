import { json, error } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createProjectSharingService } from '$lib/services/admin/project-sharing.service';
import { z } from 'zod';

const assignTeamSchema = z.object({
	teamId: z.string().nullable()
});

const projectSharingService = createProjectSharingService();

/**
 * GET /admin/projects/[id]/team
 * Get current team assignment for a project
 */
export const GET = adminHandler(async ({ params }) => {
	const projectId = params.id;
	if (!projectId) {
		throw error(400, 'Project ID is required');
	}

	const project = await projectSharingService['projectRepo'].getById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	let team = null;
	if (project.teamId) {
		team = await projectSharingService['teamRepo'].findById(project.teamId);
	}

	return json({
		projectId: project.id,
		projectName: project.name,
		teamId: project.teamId,
		team: team ? { id: team.id, name: team.name } : null
	});
});

/**
 * POST /admin/projects/[id]/team
 * Assign or reassign a project to a team
 */
export const POST = adminHandler(async ({ params, request }, user) => {
	const projectId = params.id;
	if (!projectId) {
		throw error(400, 'Project ID is required');
	}

	const body = await request.json();
	const parseResult = assignTeamSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	await projectSharingService.assignToTeam(projectId, parseResult.data.teamId, user.id);

	return json({ success: true });
});
