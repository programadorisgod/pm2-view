import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubSetupService } from '../../../src/lib/github/github-setup.service';
import type { IGitHubInstallationRepository, GitHubInstallationRecord } from '../../../src/lib/github/github.types';
import type { GitHubAppClient } from '../../../src/lib/github/infrastructure/github-app-client';

const mockInstallationRepo: Partial<IGitHubInstallationRepository> = {
	getByUserId: vi.fn(),
	getByInstallationId: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	delete: vi.fn()
};

const mockAppClient: Partial<GitHubAppClient> = {
	getInstallationInfo: vi.fn(),
	getInstallUrl: vi.fn()
};

describe('GitHubSetupService', () => {
	let service: GitHubSetupService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new GitHubSetupService(
			mockInstallationRepo as IGitHubInstallationRepository,
			mockAppClient as GitHubAppClient
		);
	});

	describe('handleSetupCallback', () => {
		it('should create a new installation for a user', async () => {
			mockAppClient.getInstallationInfo!.mockResolvedValue({
				id: 123,
				account: { login: 'testuser', type: 'User', avatarUrl: null }
			});
			mockInstallationRepo.getByInstallationId!.mockResolvedValue(null);
			mockInstallationRepo.create!.mockResolvedValue({
				id: 'uuid-1',
				userId: 'user-1',
				installationId: 123,
				accountLogin: 'testuser',
				accountType: 'User',
				accountAvatar: null,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const result = await service.handleSetupCallback('user-1', 123);

			expect(result.installationId).toBe(123);
			expect(result.userId).toBe('user-1');
			expect(mockInstallationRepo.create).toHaveBeenCalledWith({
				userId: 'user-1',
				installationId: 123,
				accountLogin: 'testuser',
				accountType: 'User',
				accountAvatar: null
			});
		});

		it('should update existing installation if it belongs to the same user', async () => {
			mockAppClient.getInstallationInfo!.mockResolvedValue({
				id: 123,
				account: { login: 'testuser', type: 'User', avatarUrl: null }
			});
			mockInstallationRepo.getByInstallationId!.mockResolvedValue({
				id: 'uuid-1',
				userId: 'user-1',
				installationId: 123,
				accountLogin: 'testuser',
				accountType: 'User',
				accountAvatar: null,
				createdAt: new Date(),
				updatedAt: new Date()
			});
			mockInstallationRepo.update!.mockResolvedValue({
				id: 'uuid-1',
				userId: 'user-1',
				installationId: 123,
				accountLogin: 'testuser',
				accountType: 'User',
				accountAvatar: null,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const result = await service.handleSetupCallback('user-1', 123);

			expect(result.installationId).toBe(123);
			expect(mockInstallationRepo.create).not.toHaveBeenCalled();
			expect(mockInstallationRepo.update).toHaveBeenCalled();
		});

		it('should reject if installation belongs to another user', async () => {
			mockAppClient.getInstallationInfo!.mockResolvedValue({
				id: 123,
				account: { login: 'testuser', type: 'User', avatarUrl: null }
			});
			mockInstallationRepo.getByInstallationId!.mockResolvedValue({
				id: 'uuid-1',
				userId: 'other-user',
				installationId: 123,
				accountLogin: 'testuser',
				accountType: 'User',
				accountAvatar: null,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			await expect(service.handleSetupCallback('user-1', 123)).rejects.toThrow(
				'GitHub installation does not belong to this user'
			);
		});

		it('should throw if installation not found on GitHub', async () => {
			mockAppClient.getInstallationInfo!.mockRejectedValue(new Error('Not found'));

			await expect(service.handleSetupCallback('user-1', 999)).rejects.toThrow(
				'Installation not found on GitHub'
			);
		});
	});

	describe('getInstallationForUser', () => {
		it('should return installation if exists', async () => {
			const mockInstallation: GitHubInstallationRecord = {
				id: 'uuid-1',
				userId: 'user-1',
				installationId: 123,
				accountLogin: 'testuser',
				accountType: 'User',
				accountAvatar: null,
				createdAt: new Date(),
				updatedAt: new Date()
			};
			mockInstallationRepo.getByUserId!.mockResolvedValue(mockInstallation);

			const result = await service.getInstallationForUser('user-1');
			expect(result).toEqual(mockInstallation);
		});

		it('should return null if no installation', async () => {
			mockInstallationRepo.getByUserId!.mockResolvedValue(null);

			const result = await service.getInstallationForUser('user-1');
			expect(result).toBeNull();
		});
	});

	describe('revokeInstallation', () => {
		it('should delete the installation', async () => {
			mockInstallationRepo.getByInstallationId!.mockResolvedValue({
				id: 'uuid-1',
				userId: 'user-1',
				installationId: 123,
				accountLogin: 'testuser',
				accountType: 'User',
				accountAvatar: null,
				createdAt: new Date(),
				updatedAt: new Date()
			});
			mockInstallationRepo.delete!.mockResolvedValue(undefined);

			await service.revokeInstallation(123);
			expect(mockInstallationRepo.delete).toHaveBeenCalledWith(123);
		});

		it('should throw if installation not found', async () => {
			mockInstallationRepo.getByInstallationId!.mockResolvedValue(null);

			await expect(service.revokeInstallation(999)).rejects.toThrow(
				'GitHub installation not found'
			);
		});
	});
});
