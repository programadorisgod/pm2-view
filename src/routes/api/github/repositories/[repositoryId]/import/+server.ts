import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { GitHubImportService } from '$lib/github/github-import.service';
import {
	GitHubInstallationNotFound,
	GitHubRepositoryNotAccessible,
	GitHubImportFailed
} from '$lib/github/github.types';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';

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

	try {
		const installationRepo = new GitHubInstallationRepository();
		const appClient = new GitHubAppClient();
		const importService = new GitHubImportService(installationRepo, appClient);

		const result = await importService.importRepository(session.user.id, repositoryId);

		// TODO: Process the cloned repository according to the existing pipeline
		// For now, return the workspace path and clean up

		await importService.cleanupWorkspace(result.workspacePath);

		return json({
			success: true,
			repositoryFullName: result.repositoryFullName,
			message: 'Repository imported successfully'
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
