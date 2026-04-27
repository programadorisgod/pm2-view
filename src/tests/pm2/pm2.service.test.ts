import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PM2Service } from '../../lib/pm2/pm2.service';
import type { IPM2Repository, PM2Process } from '../../lib/pm2/pm2.types';

// Mock repository
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

const mockProcess: PM2Process = {
	name: 'test-app',
	pm_id: 1,
	monit: {
		cpu: 25.5,
		memory: 50 * 1024 * 1024 // 50MB
	},
	pm2_env: {
		status: 'online',
		pm_uptime: Date.now() - 3600000, // 1 hour ago
		restart_time: 0
	}
};

describe('PM2Service', () => {
	let service: PM2Service;
	let mockRepo: IPM2Repository;

	beforeEach(() => {
		mockRepo = createMockRepo();
		service = new PM2Service(mockRepo);
	});

	describe('getAllProcesses', () => {
		it('should return enriched processes', async () => {
			vi.mocked(mockRepo.list).mockResolvedValue([mockProcess]);

			const processes = await service.getAllProcesses();

			expect(processes).toHaveLength(1);
			expect(processes[0].name).toBe('test-app');
			expect(processes[0].status).toBe('online');
			expect(processes[0].cpu).toBe(25.5);
			expect(processes[0].memoryMB).toBe(50);
			expect(processes[0].uptimeFormatted).toBeTruthy();
		});

		it('should return empty array when PM2 is not running', async () => {
			vi.mocked(mockRepo.list).mockRejectedValue(new Error('PM2 not running'));

			const processes = await service.getAllProcesses();

			expect(processes).toEqual([]);
		});
	});

	describe('getProcessById', () => {
		it('should return enriched process when found', async () => {
			vi.mocked(mockRepo.describe).mockResolvedValue(mockProcess);

			const process = await service.getProcessById('test-app');

			expect(process).toBeDefined();
			expect(process?.name).toBe('test-app');
			expect(process?.status).toBe('online');
		});

		it('should return null when process not found', async () => {
			vi.mocked(mockRepo.describe).mockResolvedValue(null);

			const process = await service.getProcessById('non-existent');

			expect(process).toBeNull();
		});
	});

	describe('restartProcess', () => {
		it('should return success when restart succeeds', async () => {
			vi.mocked(mockRepo.restart).mockResolvedValue(undefined);

			const result = await service.restartProcess('test-app');

			expect(result.success).toBe(true);
			expect(result.message).toContain('restarted successfully');
		});

		it('should return error when restart fails', async () => {
			vi.mocked(mockRepo.restart).mockRejectedValue(new Error('Restart failed'));

			const result = await service.restartProcess('test-app');

			expect(result.success).toBe(false);
			expect(result.message).toContain('Restart failed');
		});
	});

	describe('stopProcess', () => {
		it('should return success when stop succeeds', async () => {
			vi.mocked(mockRepo.stop).mockResolvedValue(undefined);

			const result = await service.stopProcess('test-app');

			expect(result.success).toBe(true);
		});
	});

	describe('deleteProcess', () => {
		it('should return success when delete succeeds', async () => {
			vi.mocked(mockRepo.delete).mockResolvedValue(undefined);

			const result = await service.deleteProcess('test-app');

			expect(result.success).toBe(true);
		});
	});

	describe('getProcessLogs', () => {
		it('should return logs from repository', async () => {
			const mockLogs = [
				{ type: 'out' as const, data: 'log line 1', timestamp: new Date() }
			];
			vi.mocked(mockRepo.getLogs).mockResolvedValue(mockLogs);

			const logs = await service.getProcessLogs('test-app', 50);

			expect(logs).toEqual(mockLogs);
			expect(mockRepo.getLogs).toHaveBeenCalledWith('test-app', 50);
		});

		it('should return empty array when logs fail', async () => {
			vi.mocked(mockRepo.getLogs).mockRejectedValue(new Error('Logs failed'));

			const logs = await service.getProcessLogs('test-app');

			expect(logs).toEqual([]);
		});
	});

	describe('getSummary', () => {
		it('should count processes by status', () => {
			const processes = [
				{ status: 'online' as const, name: 'app1', pm_id: 1, monit: { cpu: 0, memory: 0 }, pm2_env: { status: 'online', pm_uptime: 0, restart_time: 0 }, cpu: 0, memoryMB: 0, uptimeFormatted: '' },
				{ status: 'online' as const, name: 'app2', pm_id: 2, monit: { cpu: 0, memory: 0 }, pm2_env: { status: 'online', pm_uptime: 0, restart_time: 0 }, cpu: 0, memoryMB: 0, uptimeFormatted: '' },
				{ status: 'stopped' as const, name: 'app3', pm_id: 3, monit: { cpu: 0, memory: 0 }, pm2_env: { status: 'stopped', pm_uptime: 0, restart_time: 0 }, cpu: 0, memoryMB: 0, uptimeFormatted: '' },
				{ status: 'error' as const, name: 'app4', pm_id: 4, monit: { cpu: 0, memory: 0 }, pm2_env: { status: 'errored', pm_uptime: 0, restart_time: 0 }, cpu: 0, memoryMB: 0, uptimeFormatted: '' }
			];

			const summary = service.getSummary(processes);

			expect(summary.total).toBe(4);
			expect(summary.running).toBe(2);
			expect(summary.stopped).toBe(1);
			expect(summary.errored).toBe(1);
		});
	});

	describe('status mapping', () => {
		it('should map PM2 status to internal status correctly', async () => {
			const testCases: [string, string][] = [
				['online', 'online'],
				['launching', 'online'],
				['stopped', 'stopped'],
				['stopping', 'stopped'],
				['errored', 'error'],
				['error', 'error'],
				['unknown', 'offline']
			];

			for (const [pm2Status, expectedStatus] of testCases) {
				const process: PM2Process = {
					...mockProcess,
					pm2_env: { ...mockProcess.pm2_env, status: pm2Status }
				};
				vi.mocked(mockRepo.list).mockResolvedValue([process]);

				const processes = await service.getAllProcesses();
				expect(processes[0].status).toBe(expectedStatus);
			}
		});
	});

	describe('uptime formatting', () => {
		it('should format uptime correctly', async () => {
			const now = Date.now();
			const testCases: [number, string][] = [
				[now - 30000, '30s'], // 30 seconds
				[now - 120000, '2m 0s'], // 2 minutes
				[now - 3600000, '1h 0m'], // 1 hour
				[now - 86400000, '1d 0h'], // 1 day
				[0, 'N/A'] // No uptime
			];

			for (const [uptime, expected] of testCases) {
				const process: PM2Process = {
					...mockProcess,
					pm2_env: { ...mockProcess.pm2_env, pm_uptime: uptime === 0 ? 0 : uptime }
				};
				vi.mocked(mockRepo.list).mockResolvedValue([process]);

				const processes = await service.getAllProcesses();
				if (uptime > 0) {
					expect(processes[0].uptimeFormatted).toBe(expected);
				}
			}
		});
	});
});
