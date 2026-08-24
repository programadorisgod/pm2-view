import type { IGitHubInstallationRepository, GitHubInstallationRecord } from './github.types';
import type { GitHubAppClient } from './infrastructure/github-app-client';
import { GitHubInstallationNotFound } from './github.types';
import { logger } from '$lib/logger';

export class GitHubSetupService {
	constructor(
		private installationRepo: IGitHubInstallationRepository,
		private appClient: GitHubAppClient
	) {}

	/**
	 * Handle the setup callback from GitHub (installation completed).
	 *
	 * Flow:
	 * 1. Validate installation exists on GitHub
	 * 2. If installation exists in DB:
	 *    - If user doesn't have access yet → add them to the junction table (org membership)
	 *    - Update account info if changed
	 * 3. If installation doesn't exist:
	 *    - Create the installation record
	 *    - Add user to the junction table
	 */
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
			// Installation exists - check if user has access
			const hasAccess = await this.installationRepo.userHasAccess(userId, installationId);
			if (!hasAccess) {
				// User is accessing an org installation for the first time
				// Add them to the junction table
				await this.installationRepo.addUserToInstallation(userId, installationId);
				logger.info('[github-setup] User added to existing org installation', {
					userId,
					installationId,
					accountLogin: installationInfo.account.login
				});
			}
			// Update account info if changed
			const updated = await this.installationRepo.update(installationId, {
				accountLogin: installationInfo.account.login,
				accountType: installationInfo.account.type,
				accountAvatar: installationInfo.account.avatarUrl
			});
			return updated;
		}

		// 3. Create new installation
		const record = await this.installationRepo.create({
			userId, // Store first user as reference (nullable for org installations)
			installationId,
			accountLogin: installationInfo.account.login,
			accountType: installationInfo.account.type,
			accountAvatar: installationInfo.account.avatarUrl
		});

		// Immediately add user to the junction table
		await this.installationRepo.addUserToInstallation(userId, installationId);

		logger.info('[github-setup] GitHub installation created', {
			userId,
			installationId,
			accountLogin: installationInfo.account.login,
			accountType: installationInfo.account.type
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
		logger.info('[github-setup] GitHub installation revoked', { installationId });
	}
}
