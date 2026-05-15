import { type RequestHandler } from '@sveltejs/kit';
import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { DeployService } from '$lib/deploy/deploy.service';
import { rateLimiter } from '$lib/rate-limiter';
import type { DeployStep } from '$lib/deploy/deploy.types';

export const POST: RequestHandler = async ({ params, getClientAddress }) => {
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
				});

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
		},
	});
};
