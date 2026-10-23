import { describe, it, expect, vi } from 'vitest';
import { MetricsService } from '$lib/metrics/metrics.service';
import type { PM2Service } from '$lib/pm2/pm2.service';
import type { ProcessWithStatus } from '$lib/pm2/pm2.types';

describe('MetricsService', () => {
	it('should return zeros for empty processes list', async () => {
		const mockPM2Service = {
			getAllProcesses: vi.fn().mockResolvedValue([]),
		} as unknown as PM2Service;

		const service = new MetricsService(mockPM2Service);
		const summary = await service.getAggregatedMetrics();

		expect(summary).toEqual({
			totalCpu: 0,
			totalRam: 0,
			avgUptime: 'N/A',
			processesRunning: 0,
			totalProcesses: 0,
		});
	});

	it('should aggregate CPU, RAM and status in single pass', async () => {
		const now = Date.now();
		const mockProcesses: ProcessWithStatus[] = [
			{
				name: 'proc1',
				pm_id: 1,
				cpu: 15,
				memoryMB: 100,
				monit: { cpu: 15, memory: 100 * 1024 * 1024 },
				status: 'online',
				pm2_env: { status: 'online', pm_uptime: now - 60000 },
			} as ProcessWithStatus,
			{
				name: 'proc2',
				pm_id: 2,
				cpu: 25,
				memoryMB: 200,
				monit: { cpu: 25, memory: 200 * 1024 * 1024 },
				status: 'stopped',
				pm2_env: { status: 'stopped', pm_uptime: 0 },
			} as ProcessWithStatus,
		];

		const mockPM2Service = {
			getAllProcesses: vi.fn().mockResolvedValue(mockProcesses),
		} as unknown as PM2Service;

		const service = new MetricsService(mockPM2Service);
		const summary = await service.getAggregatedMetrics();

		expect(summary.totalCpu).toBe(40);
		expect(summary.totalRam).toBe(300 * 1024 * 1024);
		expect(summary.processesRunning).toBe(1);
		expect(summary.totalProcesses).toBe(2);
		expect(summary.avgUptime).toContain('1m');
	});
});
