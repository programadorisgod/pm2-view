import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubInstallationRepository } from '../../../src/lib/db/repositories/github-installation-repository.impl';

vi.mock('$lib/db/db', () => ({
	db: {
		query: {
			githubInstallations: {
				findFirst: vi.fn(),
				findMany: vi.fn()
			},
			githubUserInstallations: {
				findFirst: vi.fn(),
				findMany: vi.fn()
			}
		},
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		values: vi.fn().mockReturnThis(),
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([])
	}
}));

describe('GitHubInstallationRepository', () => {
	let repo: GitHubInstallationRepository;

	beforeEach(() => {
		vi.clearAllMocks();
		repo = new GitHubInstallationRepository();
	});

	it('should be instantiable', () => {
		expect(repo).toBeInstanceOf(GitHubInstallationRepository);
	});

	it('should have getByUserId method', () => {
		expect(typeof repo.getByUserId).toBe('function');
	});

	it('should have getByInstallationId method', () => {
		expect(typeof repo.getByInstallationId).toBe('function');
	});

	it('should have create method', () => {
		expect(typeof repo.create).toBe('function');
	});

	it('should have update method', () => {
		expect(typeof repo.update).toBe('function');
	});

	it('should have delete method', () => {
		expect(typeof repo.delete).toBe('function');
	});

	// New methods for org installations
	it('should have getInstallationIdsForUser method', () => {
		expect(typeof repo.getInstallationIdsForUser).toBe('function');
	});

	it('should have addUserToInstallation method', () => {
		expect(typeof repo.addUserToInstallation).toBe('function');
	});

	it('should have removeUserFromInstallation method', () => {
		expect(typeof repo.removeUserFromInstallation).toBe('function');
	});

	it('should have userHasAccess method', () => {
		expect(typeof repo.userHasAccess).toBe('function');
	});
});
