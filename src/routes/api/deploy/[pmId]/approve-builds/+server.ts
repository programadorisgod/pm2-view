import { type RequestHandler } from '@sveltejs/kit';
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

	let deployOptions: DeployOptions | undefined;
	if (projectId) {
		try {
			const envVarRepo = new EnvVarRepository();
			const vars = await envVarRepo.getByProjectId(projectId);
			if (vars.length > 0) {
				deployOptions = {
					env: Object.fromEntries(vars.map((v) => [v.key, v.value])),
				};
			}
		} catch (err) {
			logger.error('Failed to load managed env vars for approve-builds', {
				projectId,
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
