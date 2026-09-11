import { type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { getProjectRole } from '$lib/server/project-access';
import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { DeployService } from '$lib/deploy/deploy.service';
import { EnvVarRepository } from '$lib/db/repositories/env-var-repository.impl';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import type { DeployStep, DeployOptions } from '$lib/deploy/deploy.types';

export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);

	if (!rateLimitResult.allowed) {
		return new Response(
			JSON.stringify({ error: 'Too many requests. Please try again later.' }),
			{
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': String(rateLimitResult.retryAfter ?? 60),
				},
			},
		);
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	const user = session.user as any;
	if (user.banned) {
		return new Response(JSON.stringify({ error: 'Account is banned' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const pmId = params.pmId;
	if (!pmId) {
		return new Response(JSON.stringify({ error: 'Process ID is required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const pm2Repo = new PM2Repository();
	const deployService = new DeployService(pm2Repo);

	// Load DB-managed env vars for the project (fail open — non-critical)
	const body = await request.json().catch(() => null);
	const projectId =
		body && typeof body === 'object' && 'projectId' in body && typeof body.projectId === 'string'
			? body.projectId
			: undefined;

	let resolvedProjectId = projectId;
	if (!resolvedProjectId) {
		const proc = await pm2Repo.describe(pmId);
		if (proc) {
			const { ProjectRepository } = await import('$lib/db/repositories/project-repository.impl');
			const projectRepo = new ProjectRepository();
			const allProjects = await projectRepo.getAll();
			const match = allProjects.find((p) => p.pm2Name === proc.name || (p.pm2Names && p.pm2Names.includes(proc.name)));
			if (match) resolvedProjectId = match.id;
		}
	}

	if (user.role !== 'admin') {
		if (!resolvedProjectId) {
			return new Response(JSON.stringify({ error: 'Admin role required to manage unregistered processes' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		const role = await getProjectRole(user.id, resolvedProjectId, user.role);
		if (!role || (role !== 'owner' && role !== 'editor')) {
			return new Response(JSON.stringify({ error: 'Forbidden: editor or owner permission required' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	let deployOptions: DeployOptions | undefined;
	if (resolvedProjectId) {
		try {
			const envVarRepo = new EnvVarRepository();
			const vars = await envVarRepo.getByProjectId(resolvedProjectId);
			if (vars.length > 0) {
				deployOptions = {
					env: Object.fromEntries(vars.map((v) => [v.key, v.value])),
				};
			}
		} catch (err) {
			logger.error('Failed to load managed env vars for approve-builds', {
				projectId: resolvedProjectId,
				error: err,
			});
		}
	}

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			let closed = false;
			const safeEnqueue = (data: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(data + '\n'));
				} catch {
					// Stream already closed, ignore
				}
			};

			try {
				await deployService.approveAndContinue(pmId, (step: DeployStep, line: string, isError: boolean) => {
					safeEnqueue(JSON.stringify({ step, line, isError, isComplete: false }));
				}, deployOptions);

				safeEnqueue(JSON.stringify({
					step: 'complete',
					line: 'Deploy completed successfully',
					isError: false,
					isComplete: true,
					success: true,
				}));
			} catch (err) {
				safeEnqueue(JSON.stringify({
					step: 'complete',
					line: `Deploy error: ${err instanceof Error ? err.message : 'Unknown error'}`,
					isError: true,
					isComplete: true,
					success: false,
				}));
			} finally {
				closed = true;
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
};
