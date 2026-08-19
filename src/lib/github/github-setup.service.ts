import type { IGitHubInstallationRepository, GitHubInstallationRecord } from './github.types';
import type { GitHubAppClient } from './infrastructure/github-app-client';
import { GitHubInstallationNotFound, GitHubInstallationNotOwnedByUser } from './github.types';
import { logger } from '$lib/logger';

export class GitHubSetupService {
	constructor(
		private installationRepo: IGitHubInstallationRepository,
		private appClient: GitHubAppClient
	) {}

	async handleSetupCallback(
		userId: string,
		installationId: number
	): Promise<GitHubInstallationRecord> {
		// 1. Validate the installation exists on GitHub
		let installationInfo;
		try {
			installationInfo = await this.appClient.getInstallationInfo(installationId);
		} catch {
			throw new GitHubInstallationNotFound('Installation not found on GitHub');
		}

		// 2. Check if we already have this installation
		const existing = await this.installationRepo.getByInstallationId(installationId);

		if (existing) {
			// If it belongs to another user, reject
			if (existing.userId !== userId) {
				throw new GitHubInstallationNotOwnedByUser();
			}
			// Update account info if changed
			return this.installationRepo.update(installationId, {
				accountLogin: installationInfo.account.login,
				accountType: installationInfo.account.type,
				accountAvatar: installationInfo.account.avatarUrl
			});
		}

		// 3. Create new installation
		const record = await this.installationRepo.create({
			userId,
			installationId,
			accountLogin: installationInfo.account.login,
			accountType: installationInfo.account.type,
			accountAvatar: installationInfo.account.avatarUrl
		});

		logger.info('GitHub installation created', {
			userId,
			installationId,
			accountLogin: installationInfo.account.login
		});

		return record;
	}

	async getInstallationForUser(userId: string): Promise<GitHubInstallationRecord | null> {
		return this.installationRepo.getByUserId(userId);
	}

	async revokeInstallation(installationId: number): Promise<void> {
		const existing = await this.installationRepo.getByInstallationId(installationId);
		if (!existing) {
			// Already deleted — idempotent
			return;
		}

		// First delete from GitHub, then remove local record
		try {
			await this.appClient.deleteInstallation(installationId);
		} catch (err) {
			logger.warn('[github-setup] Failed to delete installation on GitHub, removing local record anyway', {
				installationId,
				error: err,
			});
		}

		await this.installationRepo.delete(installationId);
		logger.info('GitHub installation revoked', { installationId });
	}
}
