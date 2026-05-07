import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { DeployService } from '$lib/deploy/deploy.service';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import type { DeployStep } from '$lib/deploy/deploy.types';

const deploySchema = z.object({
	pm_id: z.string().min(1, 'Process ID is required'),
});

function getZodErrorMessage(result: any): string {
	if (result.success) return '';
	const firstError = result.error?.issues?.[0] || result.issues?.[0];
	return firstError?.message || 'Validation failed';
}

/** In-memory lock to prevent concurrent deploys for the same process */
const activeDeploys = new Set<string>();

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);

	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } },
		);
	}

	const body = await request.json();
	const validationResult = deploySchema.safeParse(body);

	if (!validationResult.success) {
		return json({ error: getZodErrorMessage(validationResult) }, { status: 400 });
	}

	const { pm_id } = validationResult.data;

	// Check if a deploy is already running for this process
	if (activeDeploys.has(pm_id)) {
		return json({ error: 'A deploy is already in progress for this process' }, { status: 409 });
	}

	activeDeploys.add(pm_id);

	const encoder = new TextEncoder();
	const pm2Repo = new PM2Repository();
	const deployService = new DeployService(pm2Repo);

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
				await deployService.deploy(pm_id, (step: DeployStep, line: string, isError: boolean) => {
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
				activeDeploys.delete(pm_id);
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
