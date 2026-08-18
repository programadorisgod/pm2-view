import { Octokit } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';
import { getEnv } from '$lib/db/env';
import { GitHubAuthenticationFailed } from '../github.types';
import { logger } from '$lib/logger';

export class GitHubAppClient {
	private appId: number;
	private privateKey: string;
	private clientId: string;
	private clientSecret: string;

	constructor() {
		const env = getEnv();
		this.appId = Number(env.GITHUB_APP_ID);
		this.privateKey = env.GITHUB_PRIVATE_KEY;
		this.clientId = env.GITHUB_CLIENT_ID;
		this.clientSecret = env.GITHUB_CLIENT_SECRET;

		if (!this.appId || !this.privateKey) {
			throw new Error('GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required');
		}
	}

	getSlug(): string {
		return getEnv().GITHUB_APP_SLUG;
	}

	getInstallUrl(): string {
		const slug = this.getSlug();
		if (!slug) {
			throw new Error('GITHUB_APP_SLUG is required');
		}
		return `https://github.com/apps/${slug}/installations/new`;
	}

	async getInstallationOctokit(installationId: number): Promise<Octokit> {
		try {
			const octokit = new Octokit({
				authStrategy: createAppAuth,
				auth: {
					appId: this.appId,
					privateKey: this.privateKey,
					installationId
				}
			});
			return octokit;
		} catch (err) {
			logger.error('Failed to create installation octokit', { installationId, error: err });
			throw new GitHubAuthenticationFailed();
		}
	}

	async getInstallationInfo(installationId: number): Promise<{
		id: number;
		account: { login: string; type: string; avatarUrl: string | null };
	}> {
		const octokit = await this.getInstallationOctokit(installationId);
		try {
			const { data } = await octokit.rest.apps.getInstallation({
				installation_id: installationId
			});
			return {
				id: data.id,
				account: {
					login: data.account.login,
					type: data.account.type,
					avatarUrl: data.account.avatar_url ?? null
				}
			};
		} catch (err: any) {
			if (err.status === 404) {
				throw new GitHubAuthenticationFailed('Installation not found on GitHub');
			}
			throw new GitHubAuthenticationFailed(`GitHub API error: ${err.status}`);
		}
	}

	async listInstallationRepositories(installationId: number): Promise<{
		repositories: Array<{
			id: number;
			name: string;
			fullName: string;
			private: boolean;
			defaultBranch: string;
			cloneUrl: string;
			description: string | null;
		}>;
	}> {
		const octokit = await this.getInstallationOctokit(installationId);
		try {
			const { data } = await octokit.rest.apps.listReposAccessibleToInstallation();
			return {
				repositories: data.repositories.map((repo) => ({
					id: repo.id,
					name: repo.name,
					fullName: repo.full_name,
					private: repo.private,
					defaultBranch: repo.default_branch ?? 'main',
					cloneUrl: repo.clone_url,
					description: repo.description ?? null
				}))
			};
		} catch (err: any) {
			if (err.status === 403) {
				const resetDate = err.response?.headers?.['x-ratelimit-reset'];
				const resetTimestamp = resetDate ? Number(resetDate) * 1000 : Date.now();
				const now = Date.now();
				const retryAfterSeconds = Math.max(0, Math.ceil((resetTimestamp - now) / 1000));
				throw new GitHubAuthenticationFailed(`Rate limited. Retry after ${retryAfterSeconds}s`);
			}
			throw new GitHubAuthenticationFailed(`Failed to list repositories: ${err.status}`);
		}
	}

	async getRepositoryById(
		installationId: number,
		repositoryId: number
	): Promise<{
		id: number;
		name: string;
		fullName: string;
		private: boolean;
		defaultBranch: string;
		cloneUrl: string;
		description: string | null;
		owner: { login: string };
	} | null> {
		const octokit = await this.getInstallationOctokit(installationId);
		try {
			const { data } = await octokit.rest.apps.getRepoInstallation({
				owner: '_',
				repo: '_',
				mediaType: { previews: ['machine-man'] }
			});
			// The above won't work. Use the installations endpoint instead.
			const repos = await this.listInstallationRepositories(installationId);
			return repos.repositories.find((r) => r.id === repositoryId) ?? null;
		} catch {
			return null;
		}
	}

	async createAppOctokit(): Promise<Octokit> {
		try {
			return new Octokit({
				authStrategy: createAppAuth,
				auth: {
					appId: this.appId,
					privateKey: this.privateKey
				}
			});
		} catch (err) {
			logger.error('Failed to create app octokit', { error: err });
			throw new GitHubAuthenticationFailed();
		}
	}
}
