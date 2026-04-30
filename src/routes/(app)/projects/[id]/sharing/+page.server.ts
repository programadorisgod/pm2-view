import { getProjectRole } from '$lib/server/project-access';
import { db } from '$lib/db';
import { projects, projectMembers, users, teams } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { createServices } from '$lib/services/factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const pmId = params.id;
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		// Step 1: Resolve PM2 pm_id (e.g. "0") → PM2 process name (e.g. "my-app")
		const { pm2Service } = createServices();
		const pm2Process = await pm2Service.getProcessById(pmId);
		if (!pm2Process) {
			throw error(404, 'PM2 process not found');
		}

		// Step 2: Look up project in DB by pm2Name (the PM2 process name, NOT the numeric pm_id)
		let project = await db.query.projects.findFirst({
			where: eq(projects.pm2Name, pm2Process.name)
		});

		// Auto-provision: create project record if it doesn't exist yet
		if (!project) {
			const [created] = await db.insert(projects).values({
				id: crypto.randomUUID(),
				userId: locals.user.id,
				name: pm2Process.name,
				pm2Name: pm2Process.name,
				description: `PM2 process: ${pm2Process.name}`
			}).returning();
			project = created;
		}

		const projectDbId = project.id;

		// Check project access (admin bypass included)
		const hasAccess = await getProjectRole(locals.user.id, projectDbId, locals.user.role);
		if (!hasAccess) {
			throw error(403, 'You do not have access to this project');
		}

		const members = await db.query.projectMembers.findMany({
			where: eq(projectMembers.projectId, projectDbId),
			with: {
				user: { columns: { id: true, email: true, name: true, role: true } }
			}
		});

		const allUsers = await db.select({ id: users.id, email: users.email, name: users.name })
			.from(users);

		const memberIds = new Set(members.map(m => m.userId));
		const availableUsers = allUsers.filter(u => !memberIds.has(u.id));

		// Get team info if project belongs to a team
		let teamInfo = null;
		if (project.teamId) {
			const team = await db.query.teams.findFirst({
				where: eq(teams.id, project.teamId),
				columns: { id: true, name: true }
			});
			if (team) {
				teamInfo = team;
			}
		}

		return {
			project: { id: project.id, name: project.name, pm2Name: project.pm2Name, teamId: project.teamId },
			members: members.map(m => ({
				id: m.id,
				userId: m.userId,
				role: m.role,
				user: m.user
			})),
			availableUsers,
			team: teamInfo,
			userRole: locals.user.role
		};
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to load sharing data:', e);
		throw error(500, 'Failed to load sharing data');
	}
};
