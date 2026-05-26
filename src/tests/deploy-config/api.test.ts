import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeployConfigRepository } from '../../../src/lib/db/repositories/deploy-config-repository.impl';
import type { DeployCommand } from '../../../src/lib/deploy-config/deploy-config.types';

// Mock the database
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

describe('DeployConfigRepository API behavior', () => {
	let repo: DeployConfigRepository;
	const mockFindMany = db.query.deployCommands.findMany as ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		repo = new DeployConfigRepository();
	});

	describe('GET behavior (getByProjectId)', () => {
		it('should return commands for a valid project', async () => {
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

			expect(result).toHaveLength(1);
			expect(mockFindMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.anything(),
					orderBy: expect.anything(),
				})
			);
		});

		it('should return empty array for project with no commands', async () => {
			mockFindMany.mockResolvedValue([]);

			const result = await repo.getByProjectId('empty-project');

			expect(result).toEqual([]);
		});
	});

	describe('create', () => {
		it('should be callable without errors', () => {
			expect(() => {
				repo.create({
					projectId: 'project-1',
					commandType: 'restart',
					label: 'New Command',
					command: 'pm2 restart api',
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

	describe('Ordering', () => {
		it('should pass orderBy to findMany', async () => {
			mockFindMany.mockResolvedValue([]);

			await repo.getByProjectId('project-1');

			expect(mockFindMany).toHaveBeenCalledWith(
				expect.objectContaining({
					orderBy: expect.anything(),
				})
			);
		});
	});
});