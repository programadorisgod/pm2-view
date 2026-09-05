import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeployConfigService } from '../../../src/lib/deploy-config/deploy-config.service';
import type { IDeployConfigRepository, DeployConfig, DeployCommand, CommandType } from '../../../src/lib/deploy-config/deploy-config.types';
import type { IPM2Repository } from '../../../src/lib/pm2/pm2.types';

// Mock the repository
const mockRepo: any = {
	getByProjectId: vi.fn(),
	getByType: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	delete: vi.fn(),
	deleteAllForProject: vi.fn(),
};

const mockPM2Repo: Partial<IPM2Repository> = {
	describe: vi.fn(),
	list: vi.fn(),
	restart: vi.fn(),
	stop: vi.fn(),
	delete: vi.fn(),
	getLogs: vi.fn(),
};

describe('DeployConfigService', () => {
	let service: DeployConfigService;

	const sampleCommands: DeployCommand[] = [
		{
			id: 'cmd-1',
			projectId: 'project-1',
			commandType: 'install',
			label: 'Install',
			command: 'pnpm install --frozen-lockfile',
			sortOrder: 0,
			createdAt: new Date(),
		},
		{
			id: 'cmd-2',
			projectId: 'project-1',
			commandType: 'build',
			label: 'Build',
			command: 'pnpm build',
			sortOrder: 0,
			createdAt: new Date(),
		},
		{
			id: 'cmd-3',
			projectId: 'project-1',
			commandType: 'restart',
			label: 'Restart API',
			command: 'pm2 restart api --update-env',
			sortOrder: 0,
			createdAt: new Date(),
		},
		{
			id: 'cmd-4',
			projectId: 'project-1',
			commandType: 'restart',
			label: 'Restart Worker',
			command: 'pm2 restart worker --update-env',
			sortOrder: 1,
			createdAt: new Date(),
		},
		{
			id: 'cmd-5',
			projectId: 'project-1',
			commandType: 'restart',
			label: 'Restart Cache',
			command: 'pm2 restart cache --update-env',
			sortOrder: 2,
			createdAt: new Date(),
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		service = new DeployConfigService(mockRepo as IDeployConfigRepository);
	});

	describe('getConfig', () => {
		it('should return commands grouped by type', async () => {
			mockRepo.getByProjectId!.mockResolvedValue(sampleCommands);

			const result = await service.getConfig('project-1');

			expect(result.install).toHaveLength(1);
			expect(result.install[0].commandType).toBe('install');
			expect(result.build).toHaveLength(1);
			expect(result.build[0].commandType).toBe('build');
			expect(result.restart).toHaveLength(3);
			expect(result.restart[0].commandType).toBe('restart');
		});

		it('should return empty groups for project with no config', async () => {
			mockRepo.getByProjectId!.mockResolvedValue([]);

			const result = await service.getConfig('project-empty');

			expect(result.install).toEqual([]);
			expect(result.build).toEqual([]);
			expect(result.restart).toEqual([]);
		});

		it('should sort restart commands by sortOrder', async () => {
			mockRepo.getByProjectId!.mockResolvedValue(sampleCommands);

			const result = await service.getConfig('project-1');

			expect(result.restart[0].sortOrder).toBe(0);
			expect(result.restart[1].sortOrder).toBe(1);
			expect(result.restart[2].sortOrder).toBe(2);
		});
	});

	describe('saveCommand validation', () => {
		beforeEach(() => {
			mockPM2Repo.describe!.mockResolvedValue({ name: 'Test Project' } as any);
		});

		it('should reject empty label', async () => {
			await expect(
				service.saveCommand({
					project_id: 'project-1',
					command_type: 'restart',
					label: '',
					command: 'pm2 restart api',
				})
			).rejects.toThrow('Label is required');
		});

		it('should reject whitespace-only label', async () => {
			await expect(
				service.saveCommand({
					project_id: 'project-1',
					command_type: 'restart',
					label: '   ',
					command: 'pm2 restart api',
				})
			).rejects.toThrow('Label is required');
		});

		it('should reject empty command', async () => {
			await expect(
				service.saveCommand({
					project_id: 'project-1',
					command_type: 'restart',
					label: 'Restart API',
					command: '',
				})
			).rejects.toThrow('Command is required');
		});

		it('should reject command with shell metacharacters', async () => {
			await expect(
				service.saveCommand({
					project_id: 'project-1',
					command_type: 'restart',
					label: 'Bad Command',
					command: 'echo "hello" ; rm -rf /',
				})
			).rejects.toThrow('Command contains disallowed characters');
		});

		it('should reject command with pipe character', async () => {
			await expect(
				service.saveCommand({
					project_id: 'project-1',
					command_type: 'restart',
					label: 'Pipe Command',
					command: 'pm2 restart api | pm2 restart worker',
				})
			).rejects.toThrow('Command contains disallowed characters');
		});

		it('should reject command with backticks', async () => {
			await expect(
				service.saveCommand({
					project_id: 'project-1',
					command_type: 'restart',
					label: 'Backtick Command',
					command: 'pm2 restart `something`',
				})
			).rejects.toThrow('Command contains disallowed characters');
		});

		it('should reject label over 100 characters', async () => {
			const longLabel = 'a'.repeat(101);
			await expect(
				service.saveCommand({
					project_id: 'project-1',
					command_type: 'restart',
					label: longLabel,
					command: 'pm2 restart api',
				})
			).rejects.toThrow('Label must be 100 characters or fewer');
		});

		it('should reject command over 2000 characters', async () => {
			const longCommand = 'pm2 restart api ' + 'a'.repeat(2000);
			await expect(
				service.saveCommand({
					project_id: 'project-1',
					command_type: 'restart',
					label: 'Long Command',
					command: longCommand,
				})
			).rejects.toThrow('Command must be 2000 characters or fewer');
		});

		it('should allow command with safe && chaining', async () => {
			mockRepo.getByType!.mockResolvedValue([]);
			mockRepo.create!.mockResolvedValue({
				id: 'cmd-chained',
				projectId: 'project-1',
				commandType: 'build',
				targetProcess: 'atlas-backend',
				label: 'Build Backend Chained',
				command: 'NODE_ENV=production pnpm build:config && pnpm --filter @atlas/backend build',
				sortOrder: 0,
				createdAt: new Date(),
			});

			const result = await service.saveCommand({
				project_id: 'project-1',
				command_type: 'build',
				target_process: 'atlas-backend',
				label: 'Build Backend Chained',
				command: 'NODE_ENV=production pnpm build:config && pnpm --filter @atlas/backend build',
			});

			expect(mockRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					targetProcess: 'atlas-backend',
					command: 'NODE_ENV=production pnpm build:config && pnpm --filter @atlas/backend build',
				})
			);
			expect(result.id).toBe('cmd-chained');
		});
	});

	describe('saveCommand behavior', () => {
		it('should create build command with targetProcess', async () => {
			mockRepo.getByType!.mockResolvedValue([]);
			mockRepo.create!.mockResolvedValue({
				id: 'cmd-build-1',
				projectId: 'project-1',
				commandType: 'build',
				targetProcess: 'atlas-backend',
				label: 'Build Backend',
				command: 'pnpm --filter @atlas/backend build',
				sortOrder: 0,
				createdAt: new Date(),
			});

			const result = await service.saveCommand({
				project_id: 'project-1',
				command_type: 'build',
				target_process: 'atlas-backend',
				label: 'Build Backend',
				command: 'pnpm --filter @atlas/backend build',
			});

			expect(mockRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					targetProcess: 'atlas-backend',
				})
			);
			expect(result.targetProcess).toBe('atlas-backend');
		});

		it('should append build command with auto-assigned sort_order when existing commands exist', async () => {
			mockRepo.getByType!.mockResolvedValue([sampleCommands[1]]);
			mockRepo.create!.mockResolvedValue({
				id: 'cmd-build-2',
				projectId: 'project-1',
				commandType: 'build',
				targetProcess: 'atlas-frontend',
				label: 'Build Frontend',
				command: 'pnpm --filter @atlas/frontend build',
				sortOrder: 1,
				createdAt: new Date(),
			});

			const result = await service.saveCommand({
				project_id: 'project-1',
				command_type: 'build',
				target_process: 'atlas-frontend',
				label: 'Build Frontend',
				command: 'pnpm --filter @atlas/frontend build',
			});

			expect(mockRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					sortOrder: 1,
					targetProcess: 'atlas-frontend',
				})
			);
			expect(result.sortOrder).toBe(1);
		});

		it('should append restart command with auto-assigned sort_order', async () => {
			mockRepo.getByType!.mockResolvedValue(sampleCommands.filter((c) => c.commandType === 'restart'));
			mockRepo.create!.mockResolvedValue({
				id: 'new-cmd',
				projectId: 'project-1',
				commandType: 'restart',
				label: 'New Restart',
				command: 'pm2 restart new',
				sortOrder: 3,
				createdAt: new Date(),
			});

			const result = await service.saveCommand({
				project_id: 'project-1',
				command_type: 'restart',
				label: 'New Restart',
				command: 'pm2 restart new',
			});

			expect(mockRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					sortOrder: 3, // max + 1 = 2 + 1
				})
			);
		});

		it('should create install command when none exists', async () => {
			mockRepo.getByType!.mockResolvedValue([]);
			mockRepo.create!.mockResolvedValue({
				id: 'new-cmd',
				projectId: 'project-1',
				commandType: 'install',
				label: 'New Install',
				command: 'pnpm install',
				sortOrder: 0,
				createdAt: new Date(),
			});

			const result = await service.saveCommand({
				project_id: 'project-1',
				command_type: 'install',
				label: 'New Install',
				command: 'pnpm install',
			});

			expect(mockRepo.create).toHaveBeenCalled();
		});
	});

	describe('deleteCommand', () => {
		it('should delete a command by ID', async () => {
			mockRepo.delete!.mockResolvedValue(undefined);

			await service.deleteCommand('cmd-1');

			expect(mockRepo.delete).toHaveBeenCalledWith('cmd-1');
		});

		it('should handle delete of non-existent ID gracefully', async () => {
			mockRepo.delete!.mockResolvedValue(undefined);

			// Should not throw
			await expect(service.deleteCommand('non-existent')).resolves.toBeUndefined();
		});
	});
});