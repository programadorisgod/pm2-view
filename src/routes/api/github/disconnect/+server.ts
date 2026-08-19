import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { GitHubSetupService } from '$lib/github/github-setup.service';
import { GitHubInstallationNotFound } from '$lib/github/github.types';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';

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

	try {
		const installationRepo = new GitHubInstallationRepository();
		const appClient = new GitHubAppClient();
		const setupService = new GitHubSetupService(installationRepo, appClient);

		const installation = await setupService.getInstallationForUser(session.user.id);
		if (!installation) {
			return json({ error: 'GitHub not connected' }, { status: 404 });
		}

		await setupService.revokeInstallation(installation.installationId);

		logger.info('[github-disconnect] Installation revoked', {
			userId: session.user.id,
			installationId: installation.installationId,
		});

		return json({ success: true });
	} catch (err: any) {
		if (err instanceof GitHubInstallationNotFound) {
			return json({ error: 'GitHub not connected' }, { status: 404 });
		}
		logger.error('[github-disconnect] Failed to revoke installation', {
			userId: session.user.id,
			error: err,
		});
		return json({ error: 'Failed to disconnect GitHub account' }, { status: 500 });
	}
};
