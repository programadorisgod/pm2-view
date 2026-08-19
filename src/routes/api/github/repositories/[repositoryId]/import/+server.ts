import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { GitHubImportPipelineService, type ImportStep } from '$lib/github/github-import-pipeline.service';
import {
	GitHubInstallationNotFound,
	GitHubRepositoryNotAccessible,
} from '$lib/github/github.types';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import { escapeShellArg } from '$lib/utils/shell';
import { z } from 'zod';

const importSchema = z.object({
	targetPath: z.string().min(1, 'Target path is required'),
	processName: z.string().min(1, 'Process name is required'),
	installCommand: z.string().optional(),
	buildCommand: z.string().optional(),
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

	// Parse and validate body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validationResult = importSchema.safeParse(body);
	if (!validationResult.success) {
		return json({ error: getZodErrorMessage(validationResult) }, { status: 400 });
	}

	const { targetPath, processName, installCommand, buildCommand } = validationResult.data;

	// Validate targetPath is absolute
	if (!targetPath.startsWith('/')) {
		return json(
			{ error: 'Target path must be an absolute path (must start with /)' },
			{ status: 400 }
		);
	}

	// Sanitize processName for shell safety
	let sanitizedProcessName: string;
	try {
		sanitizedProcessName = escapeShellArg(processName).replace(/^'|'$/g, '');
	} catch {
		return json({ error: 'Invalid process name' }, { status: 400 });
	}

	// GitHub API calls (fast, before streaming)
	let cloneUrl: string;
	let repoFullName: string;
	try {
		const installationRepo = new GitHubInstallationRepository();
		const appClient = new GitHubAppClient();

		const installation = await installationRepo.getByUserId(session.user.id);
		if (!installation) {
			throw new GitHubInstallationNotFound();
		}

		const repos = await appClient.listInstallationRepositories(installation.installationId);
		const repo = repos.repositories.find((r) => r.id === repositoryId);
		if (!repo) {
			throw new GitHubRepositoryNotAccessible();
		}

		const octokit = await appClient.getInstallationOctokit(installation.installationId);
		const {
			data: { token }
		} = await octokit.rest.apps.createInstallationAccessToken({
			installation_id: installation.installationId,
			repository_ids: [repositoryId],
		});

		cloneUrl = `https://x-access-token:${token}@github.com/${repo.fullName}.git`;
		repoFullName = repo.fullName;

		logger.info('GitHub clone URL generated', {
			userId: session.user.id,
			repoFullName,
			tokenLength: token?.length,
			hasToken: !!token,
		});
	} catch (err: any) {
		if (err instanceof GitHubInstallationNotFound) {
			return json({ error: 'GitHub not connected' }, { status: 404 });
		}
		if (err instanceof GitHubRepositoryNotAccessible) {
			return json({ error: 'Repository not accessible' }, { status: 404 });
		}
		const errorMessage = err?.message || String(err) || 'Unknown error';
		logger.error('Failed to prepare GitHub import', {
			userId: session.user.id,
			repositoryId,
			errorMessage,
		});
		return json({ error: `Import failed: ${errorMessage}` }, { status: 500 });
	}

	// Stream Phase 1 (clone + install + build + ecosystem detection) as NDJSON
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
				const result = await pipeline.runPhase1(
					cloneUrl,
					targetPath,
					sanitizedProcessName,
					(step: ImportStep, line: string, isError: boolean) => {
						safeEnqueue(JSON.stringify({ step, line, isError, isComplete: false }));
						// Also log server-side for debugging
						logger.info(`[github-import][${step}]`, { line, isError });
					},
					{ installCommand, buildCommand }
				);

			if (result.needsApproval) {
				safeEnqueue(JSON.stringify({
					step: 'install',
					line: result.error || 'Package manager requires approval for native builds',
					isError: true,
					isComplete: true,
					needsApproval: true,
					pendingPackages: result.pendingPackages ?? [],
					targetPath: result.targetPath,
					success: false,
				}));
			} else if (result.success) {
				safeEnqueue(JSON.stringify({
					step: 'complete',
					line: result.ecosystemFiles.length > 0
						? `Clone completed. Found ${result.ecosystemFiles.length} ecosystem file(s).`
						: 'Clone completed. No ecosystem files found.',
					isError: false,
					isComplete: true,
					success: true,
					ecosystemFiles: result.ecosystemFiles,
					targetPath: result.targetPath,
					processName: result.processName,
				}));
			} else {
				safeEnqueue(JSON.stringify({
					step: 'complete',
					line: result.error || 'Import failed',
					isError: true,
					isComplete: true,
					success: false,
				}));
			}

				logger.info('Repository imported', {
					userId: session.user.id,
					repositoryId,
					repoFullName,
					targetPath: result.targetPath,
					processName: result.processName,
				});
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err) || 'Unknown error';
				const errorStack = err instanceof Error ? err.stack : '';
				safeEnqueue(JSON.stringify({
					step: 'complete',
					line: `Error: ${errorMessage}`,
					isError: true,
					isComplete: true,
					success: false,
				}));
				logger.error('Import pipeline failed', {
					userId: session.user.id,
					repositoryId,
					errorMessage,
					errorStack,
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
