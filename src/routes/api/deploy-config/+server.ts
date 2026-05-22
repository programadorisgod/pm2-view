import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { auth } from '$lib/auth';
import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
import { DeployConfigService } from '$lib/deploy-config/deploy-config.service';
import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { getProjectRole } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

const createCommandSchema = z.object({
	project_id: z.string().min(1, 'Project ID is required'),
	command_type: z.enum(['install', 'build', 'restart']),
	label: z.string().min(1, 'Label is required').max(100, 'Label must be 100 characters or fewer'),
	command: z.string().min(1, 'Command is required').max(2000, 'Command must be 2000 characters or fewer')
});

export const POST: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const validationResult = createCommandSchema.safeParse(body);

	if (!validationResult.success) {
		const message = validationResult.error.issues[0]?.message ?? 'Validation failed';
		return json({ error: message }, { status: 400 });
	}

	const { project_id, command_type, label, command } = validationResult.data;

	// Check project access
	const role = await getProjectRole(session.user.id, project_id);
	if (!role) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	const repo = new DeployConfigRepository();
	const pm2Repo = new PM2Repository();
	const service = new DeployConfigService(repo, pm2Repo);

	try {
		const saved = await service.saveCommand({
			project_id,
			command_type,
			label,
			command
		});
		return json({ success: true, data: saved }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 400 });
	}
};