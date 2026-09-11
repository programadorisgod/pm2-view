import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { getProjectRole } from '$lib/server/project-access';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const pm2Repo = new PM2Repository();
const pm2Service = new PM2Service(pm2Repo);

async function verifyLogAccess(userId: string, userRole: string, id: string, minRole: 'viewer' | 'editor'): Promise<boolean> {
	if (userRole === 'admin') return true;

	const targetProcess = await pm2Service.getProcessById(id);
	const procName = targetProcess?.name ?? id;

	const projectRepo = new ProjectRepository();
	const allProjects = await projectRepo.getAll();
	const project = allProjects.find(
		(p) => p.id === id || p.pm2Name === procName || (p.pm2Names && p.pm2Names.includes(procName))
	);

	if (!project) return false;

	const role = await getProjectRole(userId, project.id, userRole);
	if (!role) return false;

	const hierarchy: Record<string, number> = { owner: 3, editor: 2, viewer: 1 };
	return (hierarchy[role] ?? 0) >= (hierarchy[minRole] ?? 0);
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}
	if (user.banned) {
		throw error(403, 'Account is banned');
	}

	const { id } = params;

	const hasAccess = await verifyLogAccess(user.id, user.role, id, 'viewer');
	if (!hasAccess) {
		throw error(403, 'Access denied to this project');
	}

	// Parse optional query params
	const lines = parseInt(url.searchParams.get('lines') || '100', 10);

	try {
		const logs = await pm2Service.getProcessLogs(id, lines);

		return json({
			success: true,
			logs
		});
	} catch (err) {
		return json(
			{
				success: false,
				message: err instanceof Error ? err.message : 'Failed to fetch logs',
				logs: []
			},
			{ status: 500 }
		);
	}
};

export const DELETE: RequestHandler = async ({ params, url, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}
	if (user.banned) {
		throw error(403, 'Account is banned');
	}

	const { id } = params;

	const hasAccess = await verifyLogAccess(user.id, user.role, id, 'editor');
	if (!hasAccess) {
		throw error(403, 'Forbidden: editor or owner permission required');
	}

	const stream = url.searchParams.get('stream') === 'out' ? 'out' : 'err';

	const result = await pm2Service.clearProcessLogs(id, stream);
	if (!result.success) {
		return json({ success: false, message: result.message }, { status: 500 });
	}

	return json({ success: true, message: result.message });
};

