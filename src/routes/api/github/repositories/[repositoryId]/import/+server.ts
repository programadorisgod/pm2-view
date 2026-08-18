import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { GitHubImportService } from '$lib/github/github-import.service';
import { GitHubImportPipelineService } from '$lib/github/github-import-pipeline.service';
import {
	GitHubInstallationNotFound,
	GitHubRepositoryNotAccessible,
	GitHubImportFailed
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

	try {
		const installationRepo = new GitHubInstallationRepository();
		const appClient = new GitHubAppClient();
		const importService = new GitHubImportService(installationRepo, appClient);

		// Get repository info and create access token
		const installation = await installationRepo.getByUserId(session.user.id);
		if (!installation) {
			throw new GitHubInstallationNotFound();
		}

		const repos = await appClient.listInstallationRepositories(installation.installationId);
		const repo = repos.repositories.find((r) => r.id === repositoryId);
		if (!repo) {
			throw new GitHubRepositoryNotAccessible();
		}

		// Generate access token for cloning
		// Don't request specific permissions — use whatever was granted during installation.
		// If the app lacks 'contents: read', the clone will fail with a clear error.
		const octokit = await appClient.getInstallationOctokit(installation.installationId);
		const {
			data: { token }
		} = await octokit.rest.apps.createInstallationAccessToken({
			installation_id: installation.installationId,
			repository_ids: [repositoryId],
		});

		const cloneUrl = `https://x-access-token:${token}@github.com/${repo.fullName}.git`;
		logger.info('GitHub clone URL generated', {
			userId: session.user.id,
			repoFullName: repo.fullName,
			tokenLength: token?.length,
			hasToken: !!token,
		});

		// Run the import pipeline
		const pipeline = new GitHubImportPipelineService();
		const result = await pipeline.runPhase1(
			cloneUrl,
			targetPath,
			sanitizedProcessName,
			(_step, _line, _isError) => {
				// For now, we don't stream logs in this endpoint
				// The frontend will use the start endpoint for streaming
			},
			{ installCommand, buildCommand }
		);

		if (!result.success) {
			return json(
				{ error: result.error || 'Import failed' },
				{ status: 500 }
			);
		}

		logger.info('Repository imported', {
			userId: session.user.id,
			repositoryId,
			repoFullName: repo.fullName,
			targetPath: result.targetPath,
			processName: result.processName,
		});

		return json({
			success: true,
			ecosystemFiles: result.ecosystemFiles,
			targetPath: result.targetPath,
			processName: result.processName,
			message: result.ecosystemFiles.length > 0
				? 'Clone completed. Select an ecosystem file to start.'
				: 'Clone completed. No ecosystem files found.',
		});
	} catch (err: any) {
		if (err instanceof GitHubInstallationNotFound) {
			return json({ error: 'GitHub not connected' }, { status: 404 });
		}
		if (err instanceof GitHubRepositoryNotAccessible) {
			return json({ error: 'Repository not accessible' }, { status: 404 });
		}
		if (err instanceof GitHubImportFailed) {
			return json({ error: 'Failed to import repository' }, { status: 500 });
		}
		logger.error('Failed to import repository', {
			userId: session.user.id,
			repositoryId,
			error: err
		});
		return json({ error: 'Failed to import repository' }, { status: 500 });
	}
};
