import type { PageServerLoad } from './$types';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { GitHubSetupService } from '$lib/github/github-setup.service';
import { GitHubRepositoriesService } from '$lib/github/github-repositories.service';
import { GitHubInstallationRevoked } from '$lib/github/github.types';
import { logger } from '$lib/logger';
import { getEnv } from '$lib/db/env';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user;
	logger.info('[github-page] load called', { userId: user?.id, hasUser: !!user });

	const basePath = getEnv().APP_BASE_PATH ?? '';
	const setupUrl = `${url.origin}${basePath}/github/setup`;

	if (!user) {
		return { connected: false, installation: null, repositories: [], setupUrl };
	}

	const installationRepo = new GitHubInstallationRepository();
	const appClient = new GitHubAppClient();
	const setupService = new GitHubSetupService(installationRepo, appClient);

	const installation = await setupService.getInstallationForUser(user.id);
	logger.info('[github-page] getInstallationForUser result', {
		userId: user.id,
		hasInstallation: !!installation,
		installationId: installation?.installationId
	});

	if (!installation) {
		return {
			connected: false,
			installation: null,
			repositories: [],
			setupUrl
		};
	}

	const reposService = new GitHubRepositoriesService(installationRepo, appClient);

	let repositories;
	try {
		repositories = await reposService.listRepositories(user.id);
	} catch (err) {
		if (err instanceof GitHubInstallationRevoked) {
			// Installation was revoked or no longer exists on GitHub.
			// listRepositories already cleaned up the stale DB record.
			logger.warn('[github-page] Installation revoked', {
				userId: user.id,
				installationId: installation.installationId,
			});
			return {
				connected: false,
				installation: null,
				repositories: [],
				setupUrl,
			};
		}
		throw err;
	}

	return {
		connected: true,
		installation: {
			id: installation.installationId,
			accountLogin: installation.accountLogin,
			accountType: installation.accountType,
			accountAvatar: installation.accountAvatar
		},
		repositories,
		setupUrl
	};
};
