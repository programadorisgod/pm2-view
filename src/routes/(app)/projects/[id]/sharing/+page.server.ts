import { auth } from '$lib/auth';
import { getProjectRole } from '$lib/server/project-access';
import { db } from '$lib/db';
import { projects, projectMembers, users } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const projectId = params.id;
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Check project access
	const hasAccess = await getProjectRole(locals.user.id, projectId);
	if (!hasAccess) {
		throw error(404, 'Project not found');
	}

	try {
		const project = await db.query.projects.findFirst({
			where: eq(projects.id, projectId)
		});
		if (!project) {
			throw error(404, 'Project not found');
		}

		const members = await db.query.projectMembers.findMany({
			where: eq(projectMembers.projectId, projectId),
			with: {
				user: { columns: { id: true, email: true, name: true, role: true } }
			}
		});

		const allUsers = await db.select({ id: users.id, email: users.email, name: users.name })
			.from(users);

		const memberIds = new Set(members.map(m => m.userId));
		const availableUsers = allUsers.filter(u => !memberIds.has(u.id));

		return {
			project: { id: project.id, name: project.name, pm2Name: project.pm2Name },
			members: members.map(m => ({
				id: m.id,
				userId: m.userId,
				role: m.role,
				user: m.user
			})),
			availableUsers
		};
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to load sharing data:', e);
		throw error(500, 'Failed to load sharing data');
	}
};
