import { json } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { getProjectRole } from '$lib/server/project-access';
import { DeploymentRepository } from '$lib/db/repositories/deployment-repository.impl';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const deploymentRepo = new DeploymentRepository();
	const deployment = await deploymentRepo.getById(params.id);
	if (!deployment) {
		return json({ error: 'Deployment not found' }, { status: 404 });
	}

	const userRole = (session.user as { role?: string }).role;
	const role = await getProjectRole(session.user.id, deployment.projectId, userRole);
	if (!role) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	return json({
		id: deployment.id,
		projectId: deployment.projectId,
		repository: deployment.repository,
		branch: deployment.branch,
		commitSha: deployment.commitSha,
		status: deployment.status,
		stage: deployment.stage,
		startedAt: deployment.startedAt,
		finishedAt: deployment.finishedAt,
		durationMs: deployment.durationMs,
		logs: deployment.logs,
		error: deployment.error,
		createdAt: deployment.createdAt
	});
};
