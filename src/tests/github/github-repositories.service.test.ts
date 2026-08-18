import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubRepositoriesService } from '../../../src/lib/github/github-repositories.service';
import type { IGitHubInstallationRepository } from '../../../src/lib/github/github.types';
import type { GitHubAppClient } from '../../../src/lib/github/infrastructure/github-app-client';

const mockInstallationRepo: Partial<IGitHubInstallationRepository> = {
	getByUserId: vi.fn()
};

const mockAppClient: Partial<GitHubAppClient> = {
	listInstallationRepositories: vi.fn()
};

describe('GitHubRepositoriesService', () => {
	let service: GitHubRepositoriesService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new GitHubRepositoriesService(
			mockInstallationRepo as IGitHubInstallationRepository,
			mockAppClient as GitHubAppClient
		);
	});

	describe('listRepositories', () => {
		it('should return repositories for the user', async () => {
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
				repositories: [
					{
						id: 1,
						name: 'repo1',
						fullName: 'testuser/repo1',
						private: true,
						defaultBranch: 'main',
						cloneUrl: 'https://github.com/testuser/repo1.git',
						description: null
					},
					{
						id: 2,
						name: 'repo2',
						fullName: 'testuser/repo2',
						private: false,
						defaultBranch: 'main',
						cloneUrl: 'https://github.com/testuser/repo2.git',
						description: 'A public repo'
					}
				]
			});

			const result = await service.listRepositories('user-1');

			expect(result).toHaveLength(2);
			expect(result[0].name).toBe('repo1');
			expect(result[0].private).toBe(true);
			expect(result[1].name).toBe('repo2');
			expect(result[1].private).toBe(false);
		});

		it('should throw if installation not found', async () => {
			mockInstallationRepo.getByUserId!.mockResolvedValue(null);

			await expect(service.listRepositories('user-1')).rejects.toThrow(
				'GitHub installation not found'
			);
		});

		it('should not include sensitive fields in DTO', async () => {
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
				repositories: [
					{
						id: 1,
						name: 'repo1',
						fullName: 'testuser/repo1',
						private: false,
						defaultBranch: 'main',
						cloneUrl: 'https://github.com/testuser/repo1.git',
						description: 'Test'
					}
				]
			});

			const result = await service.listRepositories('user-1');

			expect(result[0]).not.toHaveProperty('cloneUrl');
			expect(result[0]).not.toHaveProperty('description');
		});
	});
});
