import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeployConfigRepository } from '../../../src/lib/db/repositories/deploy-config-repository.impl';
import type { DeployCommand } from '../../../src/lib/deploy-config/deploy-config.types';

// Mock the database at a higher level
vi.mock('$lib/db/db', () => ({
	db: {
		query: {
			deployCommands: {
				findMany: vi.fn().mockResolvedValue([]),
			},
		},
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([]),
			}),
		}),
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([]),
				}),
			}),
		}),
		delete: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		}),
	},
}));

// Import after mocking
import { db } from '$lib/db/db';

describe('DeployConfigRepository', () => {
	let repo: DeployConfigRepository;
	const mockFindMany = db.query.deployCommands.findMany as ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		repo = new DeployConfigRepository();
	});

	describe('getByProjectId', () => {
		it('should call findMany with project filter and ordering', async () => {
			mockFindMany.mockResolvedValue([]);

			await repo.getByProjectId('project-1');

			expect(mockFindMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.anything(),
					orderBy: expect.anything(),
				})
			);
		});

		it('should return empty array when no commands exist', async () => {
			mockFindMany.mockResolvedValue([]);

			const result = await repo.getByProjectId('project-empty');

			expect(result).toEqual([]);
		});

		it('should return commands when they exist', async () => {
			const commands: DeployCommand[] = [
				{
					id: 'cmd-1',
					projectId: 'project-1',
					commandType: 'install',
					label: 'Install',
					command: 'pnpm install',
					sortOrder: 0,
					createdAt: new Date(),
				},
			];
			mockFindMany.mockResolvedValue(commands);

			const result = await repo.getByProjectId('project-1');

			expect(result).toEqual(commands);
		});
	});

	describe('create', () => {
		it('should be callable without errors', () => {
			expect(() => {
				repo.create({
					projectId: 'project-1',
					commandType: 'restart',
					label: 'Test',
					command: 'pm2 restart test',
					sortOrder: 0,
				});
			}).not.toThrow();
		});
	});

	describe('update', () => {
		it('should be callable without errors', () => {
			expect(() => {
				repo.update('cmd-1', { label: 'Updated' });
			}).not.toThrow();
		});
	});

	describe('delete', () => {
		it('should be callable without errors', () => {
			expect(() => {
				repo.delete('cmd-1');
			}).not.toThrow();
		});
	});

	describe('deleteAllForProject', () => {
		it('should be callable without errors', () => {
			expect(() => {
				repo.deleteAllForProject('project-1');
			}).not.toThrow();
		});
	});
});