import { json } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
import { DeployConfigService } from '$lib/deploy-config/deploy-config.service';
import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { getProjectRole } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { pmId } = params;

	// Check project access
	const userRole = (session.user as { role?: string }).role;
	const role = await getProjectRole(session.user.id, pmId, userRole);
	if (!role) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	const repo = new DeployConfigRepository();
	const pm2Repo = new PM2Repository();
	const service = new DeployConfigService(repo, pm2Repo);

	const config = await service.getConfig(pmId);

	return json(config);
};