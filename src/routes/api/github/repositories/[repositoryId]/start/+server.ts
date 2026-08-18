import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import { GitHubImportPipelineService, type ImportStep } from '$lib/github/github-import-pipeline.service';
import { escapeShellArg } from '$lib/utils/shell';
import { z } from 'zod';

const startSchema = z.object({
	targetPath: z.string().min(1, 'Target path is required'),
	processName: z.string().min(1, 'Process name is required'),
	ecosystemFile: z.string().min(1, 'Ecosystem file is required'),
});

function getZodErrorMessage(result: unknown): string {
	if (result && typeof result === 'object' && 'error' in result) {
		const err = result as { error?: { issues?: Array<{ message?: string }> } };
		const issues = err.error?.issues;
		if (issues && issues.length > 0) {
			return issues[0]?.message || 'Validation failed';
		}
	}
	return 'Validation failed';
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
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

	// Parse and validate body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validationResult = startSchema.safeParse(body);
	if (!validationResult.success) {
		return json({ error: getZodErrorMessage(validationResult) }, { status: 400 });
	}

	const { targetPath, processName, ecosystemFile } = validationResult.data;

	// Validate targetPath is absolute
	if (!targetPath.startsWith('/')) {
		return json(
			{ error: 'Target path must be an absolute path (must start with /)' },
			{ status: 400 }
		);
	}

	// Validate ecosystemFile doesn't contain path traversal
	if (ecosystemFile.includes('..') || ecosystemFile.startsWith('/')) {
		return json(
			{ error: 'Invalid ecosystem file path' },
			{ status: 400 }
		);
	}

	// Sanitize processName
	let sanitizedProcessName: string;
	try {
		sanitizedProcessName = escapeShellArg(processName).replace(/^'|'$/g, '');
	} catch {
		return json({ error: 'Invalid process name' }, { status: 400 });
	}

	// Stream response as NDJSON
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
					// Stream already closed, ignore
				}
			};

			try {
				const result = await pipeline.runPhase2(
					targetPath,
					sanitizedProcessName,
					ecosystemFile,
					(step: ImportStep, line: string, isError: boolean) => {
						safeEnqueue(JSON.stringify({ step, line, isError, isComplete: false }));
					},
				);

				if (result.success) {
					safeEnqueue(JSON.stringify({
						step: 'complete',
						line: 'Process started successfully',
						isError: false,
						isComplete: true,
						success: true,
					}));
				} else {
					safeEnqueue(JSON.stringify({
						step: 'complete',
						line: result.error || 'Failed to start process',
						isError: true,
						isComplete: true,
						success: false,
					}));
				}

				logger.info('PM2 process started via import', {
					userId: session.user.id,
					targetPath,
					processName: sanitizedProcessName,
					ecosystemFile,
				});
			} catch (err) {
				safeEnqueue(JSON.stringify({
					step: 'complete',
					line: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
					isError: true,
					isComplete: true,
					success: false,
				}));
				logger.error('PM2 start via import failed', {
					userId: session.user.id,
					targetPath,
					processName: sanitizedProcessName,
					ecosystemFile,
					error: err,
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
