import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { GitHubRepositoriesService } from '$lib/github/github-repositories.service';
import { GitHubInstallationNotFound } from '$lib/github/github.types';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
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

	try {
		const installationRepo = new GitHubInstallationRepository();
		const appClient = new GitHubAppClient();
		const service = new GitHubRepositoriesService(installationRepo, appClient);

		const repositories = await service.listRepositories(session.user.id);
		return json({ repositories });
	} catch (err: any) {
		if (err instanceof GitHubInstallationNotFound) {
			return json({ error: 'GitHub not connected' }, { status: 404 });
		}
		logger.error('Failed to list repositories', { userId: session.user.id, error: err });
		return json({ error: 'Failed to list repositories' }, { status: 500 });
	}
};
