import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubImportService } from '../../../src/lib/github/github-import.service';
import type { IGitHubInstallationRepository } from '../../../src/lib/github/github.types';
import type { GitHubAppClient } from '../../../src/lib/github/infrastructure/github-app-client';

const mockInstallationRepo: Partial<IGitHubInstallationRepository> = {
	getByUserId: vi.fn()
};

const mockAppClient: Partial<GitHubAppClient> = {
	listInstallationRepositories: vi.fn(),
	getInstallationOctokit: vi.fn()
};

describe('GitHubImportService', () => {
	let service: GitHubImportService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new GitHubImportService(
			mockInstallationRepo as IGitHubInstallationRepository,
			mockAppClient as GitHubAppClient
		);
	});

	describe('importRepository', () => {
		it('should throw if installation not found', async () => {
			mockInstallationRepo.getByUserId!.mockResolvedValue(null);

			await expect(service.importRepository('user-1', 123)).rejects.toThrow(
				'GitHub installation not found'
			);
		});

		it('should throw if repository not accessible', async () => {
			mockInstallationRepo.getByUserId!.mockResolvedValue({
				id: 'uuid-1',
				userId: 'user-1',
				installationId: 123,
				accountLogin: 'testuser',
				accountType: 'User',
				accountAvatar: null,
				createdAt: new Date(),
				updatedAt: new Date()
			});
			mockAppClient.listInstallationRepositories!.mockResolvedValue({
				repositories: []
			});

			await expect(service.importRepository('user-1', 999)).rejects.toThrow(
				'Repository is not accessible for this installation'
			);
		});
	});
});
