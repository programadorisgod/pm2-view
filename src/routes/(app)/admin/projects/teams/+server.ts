import { json } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createProjectSharingService } from '$lib/services/admin/project-sharing.service';

const projectSharingService = createProjectSharingService();

/**
 * GET /admin/projects/teams/available
 * Get all available teams for assignment dropdown
 */
export const GET = adminHandler(async () => {
	const teams = await projectSharingService.getAllTeams();
	return json({ teams: teams.map(t => ({ id: t.id, name: t.name })) });
});
