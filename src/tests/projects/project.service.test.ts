import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectService } from '../../lib/projects/project.service';
import type { IPM2Repository, PM2Process } from '../../lib/pm2/pm2.types';
import type { ProcessWithStatus } from '../../lib/pm2/pm2.types';
import { PM2Service } from '../../lib/pm2/pm2.service';

function createMockRepo(overrides: Partial<IPM2Repository> = {}): IPM2Repository {
	return {
		list: vi.fn().mockResolvedValue([]),
		describe: vi.fn().mockResolvedValue(null),
		restart: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
		getLogs: vi.fn().mockResolvedValue([]),
		...overrides
	};
}

const mockPM2Process: PM2Process = {
	name: 'test-project',
	pm_id: 1,
	monit: {
		cpu: 15.5,
		memory: 30 * 1024 * 1024 // 30MB
	},
	pm2_env: {
		status: 'online',
		pm_uptime: Date.now() - 7200000, // 2 hours ago
		restart_time: 1
	}
};

describe('ProjectService', () => {
	let service: ProjectService;
	let mockRepo: IPM2Repository;

	beforeEach(() => {
		mockRepo = createMockRepo();
		service = new ProjectService(mockRepo);
	});

	describe('getAllProjects', () => {
		it('should return projects with PM2 status', async () => {
			vi.mocked(mockRepo.list).mockResolvedValue([mockPM2Process]);

			const projects = await service.getAllProjects();

			expect(projects).toHaveLength(1);
			expect(projects[0].name).toBe('test-project');
			expect(projects[0].pm2Status).toBe('online');
			expect(projects[0].cpu).toBe(15.5);
			expect(projects[0].memoryMB).toBe(30);
		});

		it('should return empty array when PM2 is not running', async () => {
			vi.mocked(mockRepo.list).mockRejectedValue(new Error('PM2 not running'));

			const projects = await service.getAllProjects();

			expect(projects).toEqual([]);
		});
	});

	describe('getProjectById', () => {
		it('should return project with status when found', async () => {
			vi.mocked(mockRepo.describe).mockResolvedValue(mockPM2Process);

			const project = await service.getProjectById('1');

			expect(project).toBeDefined();
			expect(project?.name).toBe('test-project');
			expect(project?.pm2Status).toBe('online');
		});

		it('should return null when process not found', async () => {
			vi.mocked(mockRepo.describe).mockResolvedValue(null);

			const project = await service.getProjectById('999');

			expect(project).toBeNull();
		});
	});

	describe('mapPm2ToProject', () => {
		it('should map PM2 process to project format', () => {
			const pm2Service = new PM2Service(mockRepo);
			const enrichedProcess: ProcessWithStatus = {
				...mockPM2Process,
				status: 'online',
				cpu: 15.5,
				memoryMB: 30,
				uptimeFormatted: '2h 0m'
			};

			// Access private method via any cast for testing
			const mapped = (service as any).mapPm2ToProject(enrichedProcess);

			expect(mapped.id).toBe('1');
			expect(mapped.name).toBe('test-project');
			expect(mapped.pm2Status).toBe('online');
			expect(mapped.cpu).toBe(15.5);
			expect(mapped.memoryMB).toBe(30);
			expect(mapped.uptimeFormatted).toBe('2h 0m');
		});
	});

	describe('getProjectActions', () => {
		it('should return action functions', async () => {
			const actions = await service.getProjectActions();

			expect(typeof actions.restart).toBe('function');
			expect(typeof actions.stop).toBe('function');
			expect(typeof actions.delete).toBe('function');
		});
	});
});
