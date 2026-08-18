import type { IGitHubInstallationRepository, GitHubRepoDTO } from './github.types';
import type { GitHubAppClient } from './infrastructure/github-app-client';
import { GitHubInstallationNotFound } from './github.types';
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

		const { repositories } = await this.appClient.listInstallationRepositories(
			installation.installationId
		);

		return repositories.map((repo) => ({
			id: repo.id,
			name: repo.name,
			fullName: repo.fullName,
			private: repo.private,
			defaultBranch: repo.defaultBranch
		}));
	}
}
