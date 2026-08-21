import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { auth } from '$lib/auth';
import { getProjectRole } from '$lib/server/project-access';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { DeploymentRepository } from '$lib/db/repositories/deployment-repository.impl';
import type { RequestHandler } from './$types';

// Branch names never reach a shell; validated for sanity and GitHub ref compatibility.
const BRANCH_REGEX = /^[A-Za-z0-9._\-/]+$/;
const REPO_REGEX = /^[A-Za-z0-9-_.]+\/[A-Za-z0-9-_.]+$/;

const settingsSchema = z.object({
	autoDeployEnabled: z.boolean(),
	githubRepo: z
		.string()
		.trim()
		.regex(REPO_REGEX, 'Repository must be in owner/name format')
		.nullable()
		.optional(),
	deployBranch: z
		.string()
		.trim()
		.min(1, 'Branch is required')
		.max(200)
		.regex(BRANCH_REGEX, 'Branch contains invalid characters')
});

function parseSettings(body: unknown) {
	return settingsSchema.safeParse(body);
}

export const GET: RequestHandler = async ({ params, request }) => {
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

	const projectRepo = new ProjectRepository();
	const project = await projectRepo.getById(projectId);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const deploymentRepo = new DeploymentRepository();
	const lastDeployment = await deploymentRepo.getLatestByProjectId(projectId);

	return json({
		autoDeployEnabled: project.autoDeployEnabled,
		githubRepo: project.githubRepo,
		deployBranch: project.deployBranch,
		targetPath: project.targetPath,
		pm2Name: project.pm2Name,
		lastDeployment: lastDeployment
			? {
					id: lastDeployment.id,
					status: lastDeployment.status,
					stage: lastDeployment.stage,
					commitSha: lastDeployment.commitSha,
					durationMs: lastDeployment.durationMs,
					finishedAt: lastDeployment.finishedAt,
					error: lastDeployment.error
				}
			: null
	});
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id: projectId } = params;
	const userRole = (session.user as { role?: string }).role;
	const role = await getProjectRole(session.user.id, projectId, userRole);
	if (!role || (role !== 'owner' && role !== 'editor')) {
		return json({ error: 'Forbidden: editor or owner permission required' }, { status: 403 });
	}

	const body = await request.json().catch(() => null);
	const parsed = parseSettings(body);
	if (!parsed.success) {
		const issue = parsed.error.issues?.[0];
		return json({ error: issue?.message ?? 'Invalid deployment settings' }, { status: 400 });
	}

	const projectRepo = new ProjectRepository();
	const project = await projectRepo.getById(projectId);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const githubRepo = parsed.data.githubRepo ?? project.githubRepo;

	if (parsed.data.autoDeployEnabled && !githubRepo) {
		return json(
			{ error: 'githubRepo is required when enabling automatic deployment' },
			{ status: 400 }
		);
	}

	const updated = await projectRepo.update(projectId, {
		autoDeployEnabled: parsed.data.autoDeployEnabled,
		githubRepo: githubRepo ?? null,
		deployBranch: parsed.data.deployBranch
	});

	return json({
		autoDeployEnabled: updated.autoDeployEnabled,
		githubRepo: updated.githubRepo,
		deployBranch: updated.deployBranch
	});
};
