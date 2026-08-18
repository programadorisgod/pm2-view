import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IGitHubInstallationRepository } from './github.types';
import type { GitHubAppClient } from './infrastructure/github-app-client';
import {
	GitHubInstallationNotFound,
	GitHubRepositoryNotAccessible,
	GitHubImportFailed
} from './github.types';
import { logger } from '$lib/logger';

const execFileAsync = promisify(execFile);

export class GitHubImportService {
	constructor(
		private installationRepo: IGitHubInstallationRepository,
		private appClient: GitHubAppClient
	) {}

	async importRepository(
		userId: string,
		repositoryId: number
	): Promise<{ workspacePath: string; repositoryFullName: string }> {
		// 1. Find the user's installation
		const installation = await this.installationRepo.getByUserId(userId);
		if (!installation) {
			throw new GitHubInstallationNotFound();
		}

		// 2. Get the repository info from GitHub
		const repos = await this.appClient.listInstallationRepositories(installation.installationId);
		const repo = repos.repositories.find((r) => r.id === repositoryId);
		if (!repo) {
			throw new GitHubRepositoryNotAccessible();
		}

		// 3. Generate a fresh access token
		const octokit = await this.appClient.getInstallationOctokit(installation.installationId);
		const {
			data: { token }
		} = await octokit.rest.apps.createInstallationAccessToken({
			installation_id: installation.installationId,
			repository_ids: [repositoryId],
			permissions: { contents: 'read' }
		});

		// 4. Create temp workspace and clone
		const workspacePath = await mkdtemp(join(tmpdir(), 'github-import-'));
		const cloneUrl = `https://x-access-token:${token}@github.com/${repo.fullName}.git`;

		try {
			await execFileAsync('git', ['clone', '--depth', '1', cloneUrl, repo.name], {
				cwd: workspacePath,
				timeout: 120_000
			});

			const fullPath = join(workspacePath, repo.name);

			logger.info('Repository imported', {
				userId,
				repositoryId,
				repoFullName: repo.fullName,
				workspacePath: fullPath
			});

			return {
				workspacePath: fullPath,
				repositoryFullName: repo.fullName
			};
		} catch (err) {
			// Clean up on failure
			await rm(workspacePath, { recursive: true, force: true }).catch(() => {});
			logger.error('Repository clone failed', {
				userId,
				repositoryId,
				repoFullName: repo.fullName,
				error: err
			});
			throw new GitHubImportFailed(
				err instanceof Error ? err.message : 'Failed to clone repository'
			);
		}
	}

	async cleanupWorkspace(workspacePath: string): Promise<void> {
		try {
			await rm(workspacePath, { recursive: true, force: true });
		} catch {
			// Best effort cleanup
		}
	}
}
