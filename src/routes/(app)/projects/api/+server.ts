import { createServices } from '$lib/services/factory';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { auth } from '$lib/auth';
import { getProjectRole } from '$lib/server/project-access';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { AuditLogRepository } from '$lib/db/repositories/audit-log-repository.impl';
import type { RequestHandler } from './$types';

const actionSchema = z.object({
	pm_id: z.string().min(1, 'Process ID is required'),
	deleteFiles: z.boolean().optional().default(false),
	pm2Names: z.array(z.string()).optional(),
});

function getZodErrorMessage(result: any): string {
	if (result.success) return '';
	const firstError = result.error?.issues?.[0] || result.issues?.[0];
	return firstError?.message || 'Validation failed';
}

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);

	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const user = session.user as any;
	if (user.banned) {
		return json({ error: 'Account is banned' }, { status: 403 });
	}

	const { pm2Service } = createServices();
	const action = url.searchParams.get('action');
	if (!action || !['restart', 'stop', 'start', 'delete'].includes(action)) {
		return json({ error: 'Invalid action' }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validationResult = actionSchema.safeParse(body);
	if (!validationResult.success) {
		return json({ error: getZodErrorMessage(validationResult) }, { status: 400 });
	}

	const { pm_id, deleteFiles, pm2Names } = validationResult.data;

	// Resolve process name
	const targetProcess = await pm2Service.getProcessById(pm_id);
	const procName = targetProcess?.name ?? pm_id;

	// Check access permissions
	if (user.role !== 'admin') {
		const projectRepo = new ProjectRepository();
		const allProjects = await projectRepo.getAll();
		const project = allProjects.find((p) => {
			if (p.pm2Name === procName) return true;
			if (p.pm2Names) {
				try {
					const names = JSON.parse(p.pm2Names) as string[];
					return names.includes(procName);
				} catch {
					return false;
				}
			}
			return false;
		});

		if (!project) {
			return json({ error: 'Admin role required to manage unregistered processes' }, { status: 403 });
		}

		const memberRole = await getProjectRole(user.id, project.id, user.role);
		if (!memberRole) {
			return json({ error: 'Access denied to this project' }, { status: 403 });
		}

		if (action === 'delete' && memberRole !== 'owner') {
			return json({ error: 'Only project owners can delete processes' }, { status: 403 });
		}

		if (action !== 'delete' && memberRole !== 'owner' && memberRole !== 'editor') {
			return json({ error: 'Insufficient permissions: editor or owner required' }, { status: 403 });
		}
	}

	let response;
	switch (action) {
		case 'restart':
			response = await pm2Service.restartProcess(pm_id);
			break;
		case 'stop':
			response = await pm2Service.stopProcess(pm_id);
			break;
		case 'start':
			response = await pm2Service.startProcess(pm_id);
			break;
		case 'delete': {
			if (pm2Names && pm2Names.length > 0) {
				const results: string[] = [];
				const errors: string[] = [];
				for (const name of pm2Names) {
					const result = await pm2Service.deleteProcess(name, deleteFiles);
					if (result.success) {
						results.push(name);
					} else {
						errors.push(`${name}: ${result.message}`);
					}
				}
				if (results.length === 0) {
					return json({ error: `Failed to delete processes: ${errors.join(', ')}` }, { status: 500 });
				}
				response = {
					success: true,
					message: errors.length > 0
						? `${results.length} deleted, ${errors.length} failed: ${errors.join(', ')}`
						: `${results.length} processes deleted successfully`
				};
			} else {
				response = await pm2Service.deleteProcess(pm_id, deleteFiles);
			}
			break;
		}
	}

	if (!response || !response.success) {
		return json({ error: response?.message ?? 'Operation failed' }, { status: 500 });
	}

	try {
		const auditRepo = new AuditLogRepository();
		await auditRepo.create({
			action: `process_${action}`,
			actorId: user.id,
			resourceType: 'process',
			resourceId: procName,
			details: { pm_id, action, deleteFiles }
		});
	} catch (auditErr) {
		logger.warn('Failed to record audit log for process action', { error: String(auditErr) });
	}

	return json({ success: true, message: response.message });
};

