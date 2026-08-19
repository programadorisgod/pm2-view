import type { IGitHubInstallationRepository, GitHubRepoDTO } from './github.types';
import type { GitHubAppClient } from './infrastructure/github-app-client';
import { GitHubInstallationNotFound, GitHubInstallationRevoked } from './github.types';
import { logger } from '$lib/logger';

export class GitHubRepositoriesService {
	constructor(
		private installationRepo: IGitHubInstallationRepository,
		private appClient: GitHubAppClient
	) {}

	async listRepositories(userId: string): Promise<GitHubRepoDTO[]> {
		const installation = await this.installationRepo.getByUserId(userId);
		if (!installation) {
			throw new GitHubInstallationNotFound();
		}

		try {
			const { repositories } = await this.appClient.listInstallationRepositories(
				installation.installationId
			);

			return repositories.map((repo) => ({
				id: repo.id,
				name: repo.name,
				fullName: repo.fullName,
				private: repo.private,
				defaultBranch: repo.defaultBranch,
				updatedAt: repo.updatedAt
			}));
		} catch (err) {
			if (err instanceof GitHubInstallationRevoked) {
				// Installation was revoked or no longer exists on GitHub
				logger.warn('[github-repos] Installation revoked, cleaning up DB', {
					userId,
					installationId: installation.installationId,
				});
				await this.installationRepo.delete(installation.installationId);
			}
			throw err;
		}
	}
}
