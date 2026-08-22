import type { IGitHubInstallationRepository } from '$lib/github/github.types';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { logger } from '$lib/logger';

export interface GitAuthTokenProvider {
	/**
	 * Returns a short-lived token granting read access to the repository
	 * ("owner/name"), or null when no credentials are available and the
	 * repository's default auth (public repo / preconfigured remote) is used.
	 */
	getToken(repository: string): Promise<string | null>;
}

/**
 * Resolves GitHub App installation tokens for git operations.
 * The owner part of "owner/name" is matched against registered installations.
 */
export class GithubAppTokenProvider implements GitAuthTokenProvider {
	constructor(
		private installationRepo: Pick<IGitHubInstallationRepository, 'getByAccountLogin'>,
		private appClient: Pick<GitHubAppClient, 'createInstallationToken'>
	) {}

	async getToken(repository: string): Promise<string | null> {
		const owner = repository.split('/')[0];
		if (!owner) return null;

		try {
			const installation = await this.installationRepo.getByAccountLogin(owner);
			if (!installation) return null;
			return await this.appClient.createInstallationToken(installation.installationId);
		} catch (err) {
			logger.warn('Could not mint git auth token; falling back to remote credentials', {
				repository,
				error: err
			});
			return null;
		}
	}
}
