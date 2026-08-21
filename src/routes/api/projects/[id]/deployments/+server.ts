import { json } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { getProjectRole } from '$lib/server/project-access';
import { DeploymentRepository } from '$lib/db/repositories/deployment-repository.impl';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, url }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id: projectId } = params;
	const userRole = (session.user as { role?: string }).role;
	const role = await getProjectRole(session.user.id, projectId, userRole);
	if (!role) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	const limitParam = Number(url.searchParams.get('limit') ?? '20');
	const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

	const repo = new DeploymentRepository();
	const deployments = await repo.getByProjectId(projectId, limit);

	return json({
		deployments: deployments.map((d) => ({
			id: d.id,
			repository: d.repository,
			branch: d.branch,
			commitSha: d.commitSha,
			status: d.status,
			stage: d.stage,
			startedAt: d.startedAt,
			finishedAt: d.finishedAt,
			durationMs: d.durationMs,
			error: d.error,
			createdAt: d.createdAt
		}))
	});
};
