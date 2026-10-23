import { describe, it, expect } from 'vitest';
import { filterLogsSinglePass } from '$lib/ui/components/log-viewer/log-filter';
import type { LogEntry } from '$lib/ui/components/log-viewer/log-hasher';

describe('log-filter single pass', () => {
	const sampleLogs: LogEntry[] = [
		{ id: '1', type: 'out', data: 'Server starting', timestamp: new Date(1000), hasTimestamp: true, level: 'info', dismissed: false },
		{ id: '2', type: 'err', data: 'Warning memory high', timestamp: new Date(2000), hasTimestamp: true, level: 'warn', dismissed: false },
		{ id: '3', type: 'err', data: 'Fatal crash', timestamp: new Date(3000), hasTimestamp: true, level: 'error', dismissed: false },
		{ id: '4', type: 'out', data: 'Dismissed log', timestamp: new Date(4000), hasTimestamp: true, level: 'info', dismissed: true },
	];

	const defaultOptions = {
		showDismissed: false,
		filterLevel: 'all' as const,
		filterStream: 'all' as const,
		searchQuery: '',
		dateFrom: '',
		dateTo: '',
		sortOrder: 'oldest' as const,
		errBaseline: 2500,
	};

	it('should filter dismissed logs by default and count them', () => {
		const res = filterLogsSinglePass(sampleLogs, defaultOptions);
		expect(res.filteredLogs).toHaveLength(3);
		expect(res.dismissedCount).toBe(1);
		expect(res.levelCounts).toEqual({ info: 1, warn: 1, error: 1 });
		expect(res.newErrCount).toBe(1); // 3000 > 2500
	});

	it('should filter by level while preserving tab levelCounts', () => {
		const res = filterLogsSinglePass(sampleLogs, { ...defaultOptions, filterLevel: 'error' });
		expect(res.filteredLogs).toHaveLength(1);
		expect(res.filteredLogs[0].id).toBe('3');
		expect(res.levelCounts).toEqual({ info: 1, warn: 1, error: 1 });
	});

	it('should filter by search query', () => {
		const res = filterLogsSinglePass(sampleLogs, { ...defaultOptions, searchQuery: 'memory' });
		expect(res.filteredLogs).toHaveLength(1);
		expect(res.filteredLogs[0].data).toContain('memory');
	});
});
