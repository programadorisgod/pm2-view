import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { GitHubImportPipelineService, type ImportStep } from '$lib/github/github-import-pipeline.service';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import { z } from 'zod';

const approveSchema = z.object({
	targetPath: z.string().min(1, 'Target path is required'),
	processName: z.string().min(1, 'Process name is required'),
	installCommand: z.string().optional(),
	buildCommand: z.string().optional(),
});

export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);
	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const repositoryId = Number(params.repositoryId);
	if (isNaN(repositoryId) || repositoryId <= 0) {
		return json({ error: 'Invalid repository ID' }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validationResult = approveSchema.safeParse(body);
	if (!validationResult.success) {
		const issues = validationResult.error.issues;
		const message = issues.length > 0 ? issues[0].message : 'Validation failed';
		return json({ error: message }, { status: 400 });
	}

	const { targetPath, processName, installCommand, buildCommand } = validationResult.data;

	const encoder = new TextEncoder();
	const pipeline = new GitHubImportPipelineService();

	const stream = new ReadableStream({
		async start(controller) {
			let closed = false;
			const safeEnqueue = (data: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(data + '\n'));
				} catch {
					// Stream already closed
				}
			};

			const onLog = (step: ImportStep, line: string, isError: boolean) => {
				safeEnqueue(JSON.stringify({ step, line, isError, isComplete: false }));
				logger.info(`[github-import-approve][${step}]`, { line, isError });
			};

			try {
				// Step 1: Run approve-builds
				const approveResult = await pipeline.approveBuilds(targetPath, onLog);

				if (!approveResult.success) {
					safeEnqueue(JSON.stringify({
						step: 'complete',
						line: approveResult.error || 'approve-builds failed',
						isError: true,
						isComplete: true,
						success: false,
					}));
					return;
				}

				// Step 2: Re-run install (should succeed now)
				const installResult = await pipeline.runPhase1(
					'', // cloneUrl not needed — repo already cloned
					targetPath,
					processName,
					onLog,
					{ installCommand, buildCommand, skipClone: true },
				);

				if (!installResult.success) {
					safeEnqueue(JSON.stringify({
						step: 'complete',
						line: installResult.error || 'Install failed after approval',
						isError: true,
						isComplete: true,
						success: false,
					}));
					return;
				}

				safeEnqueue(JSON.stringify({
					step: 'complete',
					line: installResult.ecosystemFiles.length > 0
						? `Approve + install completed. Found ${installResult.ecosystemFiles.length} ecosystem file(s).`
						: 'Approve + install completed. No ecosystem files found.',
					isError: false,
					isComplete: true,
					success: true,
					ecosystemFiles: installResult.ecosystemFiles,
					targetPath: installResult.targetPath,
					processName: installResult.processName,
				}));

				logger.info('Import approve-builds completed', {
					userId: session.user.id,
					repositoryId,
					targetPath,
					processName,
				});
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err) || 'Unknown error';
				safeEnqueue(JSON.stringify({
					step: 'complete',
					line: `Error: ${errorMessage}`,
					isError: true,
					isComplete: true,
					success: false,
				}));
				logger.error('Import approve-builds failed', {
					userId: session.user.id,
					repositoryId,
					errorMessage,
				});
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
