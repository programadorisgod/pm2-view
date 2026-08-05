import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { auth } from '$lib/auth';
import { EnvVarRepository } from '$lib/db/repositories/env-var-repository.impl';
import { getProjectRole } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

const envVarSchema = z.object({
	key: z
		.string()
		.min(1, 'Key is required')
		.max(255)
		.regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Key must be a valid env var name'),
	value: z.string().max(4096),
	isSecret: z.boolean().default(false),
});

const saveSchema = z.object({
	envVars: z.array(envVarSchema).max(200, 'Too many environment variables'),
});

export const GET: RequestHandler = async ({ params, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { projectId } = params;
	const userRole = (session.user as { role?: string }).role;
	const role = await getProjectRole(session.user.id, projectId, userRole);
	if (!role) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	const repo = new EnvVarRepository();
	const envVars = await repo.getByProjectId(projectId);
	return json(envVars);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { projectId } = params;
	const userRole = (session.user as { role?: string }).role;
	const role = await getProjectRole(session.user.id, projectId, userRole);
	if (!role || (role !== 'owner' && role !== 'editor')) {
		return json({ error: 'Forbidden: editor or owner permission required' }, { status: 403 });
	}

	const body = await request.json().catch(() => null);
	const parsed = saveSchema.safeParse(body);
	if (!parsed.success) {
		const issue = parsed.error.issues?.[0];
		return json({ error: issue?.message ?? 'Invalid environment variables' }, { status: 400 });
	}

	const repo = new EnvVarRepository();
	const saved = await repo.bulkUpdate(
		projectId,
		parsed.data.envVars.map((v) => ({ ...v, projectId })),
	);
	return json(saved);
};
