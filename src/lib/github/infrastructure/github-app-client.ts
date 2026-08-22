import { Octokit } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';
import { createSign } from 'node:crypto';
import { getEnv } from '$lib/db/env';
import { GitHubAuthenticationFailed, GitHubInstallationRevoked } from '../github.types';
import { logger } from '$lib/logger';

export class GitHubAppClient {
	private appId: number;
	private privateKey: string;
	readonly clientId: string;
	readonly clientSecret: string;

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

	/**
	 * Mints a short-lived installation access token (expires in ~1 hour).
	 * Used for git HTTPS operations (fetch/pull) during auto-deployments.
	 */
	async createInstallationToken(installationId: number): Promise<string> {
		try {
			const auth = createAppAuth({
				appId: this.appId,
				privateKey: this.privateKey
			});
			const { token } = await auth({ type: 'installation', installationId });
			return token;
		} catch (err) {
			logger.error('Failed to create installation token', { installationId, error: err });
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

			if (!data.account) {
				throw new GitHubAuthenticationFailed('Installation has no account');
			}

			const account = data.account;
			const login = 'login' in account ? account.login : account.name ?? '';
			const type = 'type' in account ? account.type : 'Organization';

			return {
				id: data.id,
				account: {
					login,
					type,
					avatarUrl: account.avatar_url ?? null
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
			updatedAt: string;
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
					description: repo.description ?? null,
					updatedAt: repo.updated_at
				}))
			};
		} catch (err: any) {
			if (err.status === 404) {
				throw new GitHubInstallationRevoked('Installation not found or revoked on GitHub');
			}
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

	/**
	 * Generate a JWT for authenticating as the GitHub App itself (not as an installation).
	 * Required for endpoints like DELETE /app/installations/{id}.
	 * Uses Node.js crypto module — no external dependencies.
	 */
	async getAppJwt(): Promise<string> {
		const now = Math.floor(Date.now() / 1000);
		const header = this.base64Url(JSON.stringify({ alg: 'RS256' }));
		const payload = this.base64Url(JSON.stringify({
			iat: now,
			exp: now + 600, // 10 minutes (GitHub max)
			iss: String(this.appId),
		}));

		const signInput = `${header}.${payload}`;
		const signer = createSign('RSA-SHA256');
		signer.update(signInput);
		signer.end();
		const signature = signer.sign(this.privateKey);

		return `${signInput}.${this.base64Url(signature)}`;
	}

	private base64Url(data: string | Uint8Array): string {
		const base64 = typeof data === 'string'
			? Buffer.from(data).toString('base64')
			: Buffer.from(data).toString('base64');
		return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	/**
	 * Delete a GitHub App installation from GitHub (revokes the app from the user/org account).
	 */
	async deleteInstallation(installationId: number): Promise<void> {
		const jwt = await this.getAppJwt();
		const env = getEnv();
		const apiUrl = env.GITHUB_API_URL ?? 'https://api.github.com';

		const res = await fetch(`${apiUrl}/app/installations/${installationId}`, {
			method: 'DELETE',
			headers: {
				'Authorization': `Bearer ${jwt}`,
				'Accept': 'application/vnd.github+json',
			},
		});

		if (!res.ok && res.status !== 404) {
			const body = await res.text();
			logger.error('[github-app] Failed to delete installation on GitHub', {
				installationId,
				status: res.status,
				body,
			});
			throw new GitHubAuthenticationFailed(`Failed to delete GitHub installation: ${res.status}`);
		}

		logger.info('[github-app] Installation deleted on GitHub', { installationId });
	}
}
