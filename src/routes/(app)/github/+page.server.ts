import type { PageServerLoad } from './$types';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { GitHubSetupService } from '$lib/github/github-setup.service';
import { GitHubRepositoriesService } from '$lib/github/github-repositories.service';
import { logger } from '$lib/logger';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	logger.info('[github-page] load called', { userId: user?.id, hasUser: !!user });

	if (!user) {
		return { connected: false, installation: null, repositories: [], installUrl: '' };
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
			installUrl: appClient.getInstallUrl()
		};
	}

	const reposService = new GitHubRepositoriesService(installationRepo, appClient);
	const repositories = await reposService.listRepositories(user.id);

	return {
		connected: true,
		installation: {
			id: installation.installationId,
			accountLogin: installation.accountLogin,
			accountType: installation.accountType,
			accountAvatar: installation.accountAvatar
		},
		repositories,
		installUrl: ''
	};
};
