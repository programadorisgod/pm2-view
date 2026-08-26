import { auth } from '$lib/auth';
import { requireProjectAccess } from '$lib/server/route-guards';
import { isUuid } from '$lib/utils/ids';
import { createServices } from '$lib/services/factory';
import { db } from '$lib/db';
import { projects } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	// Parent layout should have already checked authentication
	if (!session?.user) {
		return { user: null, session: null };
	}

	const { id: paramId } = event.params;

	// Resolve PM2 numeric ID to project UUID
	let projectId: string;
	if (isUuid(paramId)) {
		projectId = paramId;
	} else {
		const { pm2Service } = createServices();
		const pm2Process = await pm2Service.getProcessById(paramId);
		if (!pm2Process) {
			return { user: session.user, session: session.session, projectId: paramId, memberRole: null };
		}
		let project = await db.query.projects.findFirst({
			where: eq(projects.pm2Name, pm2Process.name),
			columns: { id: true }
		});
		// If not found by pm2Name, check if this process is a member of a group
		if (!project) {
			const allProjects = await db.query.projects.findMany({
				columns: { id: true, pm2Names: true }
			});
			project = allProjects.find(p => {
				if (!p.pm2Names) return false;
				try {
					const names = JSON.parse(p.pm2Names) as string[];
					return names.includes(pm2Process.name);
				} catch { return false; }
			}) ?? null;
		}
		if (!project) {
			return { user: session.user, session: session.session, projectId: paramId, memberRole: null };
		}
		projectId = project.id;
	}

	// Check project membership and get member record
	// Admins have universal access, creators get 'owner' role
	const member = await requireProjectAccess(projectId, session.user);

	// Determine the effective role: from member record, or 'owner' for creator, or 'admin' for admins
	let effectiveRole: string;
	if (session.user.role === 'admin') {
		effectiveRole = 'admin';
	} else if (member) {
		effectiveRole = member.role;
	} else {
		// Project creator without explicit member record
		effectiveRole = 'owner';
	}

	return {
		user: session.user,
		session: session.session,
		projectId,
		memberRole: effectiveRole
	};
};
