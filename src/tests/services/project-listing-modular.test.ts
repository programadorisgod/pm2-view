import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceDetector } from '$lib/services/project-listing/workspace-detector';
import { ProjectGrouper } from '$lib/services/project-listing/project-grouper';
import type { ProcessWithStatus } from '$lib/pm2/pm2.types';
import type { Project } from '$lib/projects/project.types';

describe('WorkspaceDetector', () => {
	beforeEach(() => {
		WorkspaceDetector.clearCache();
	});

	it('should return null for empty start directory', () => {
		expect(WorkspaceDetector.getWorkspaceRoot('')).toBeNull();
	});

	it('should detect this workspace root (pm2-view with pnpm-workspace.yaml)', () => {
		const root = WorkspaceDetector.getWorkspaceRoot(process.cwd());
		expect(root).toBeTruthy();
	});
});

describe('ProjectGrouper', () => {
	it('should calculate worst status correctly', () => {
		const procs = [
			{ status: 'online' },
			{ status: 'error' },
			{ status: 'stopped' },
		] as ProcessWithStatus[];
		expect(ProjectGrouper.getWorstStatus(procs)).toBe('error');

		const stoppedProcs = [
			{ status: 'online' },
			{ status: 'stopped' },
		] as ProcessWithStatus[];
		expect(ProjectGrouper.getWorstStatus(stoppedProcs)).toBe('stopped');

		const onlineProcs = [
			{ status: 'online' },
			{ status: 'online' },
		] as ProcessWithStatus[];
		expect(ProjectGrouper.getWorstStatus(onlineProcs)).toBe('online');
	});

	it('should format uptime safely', () => {
		expect(ProjectGrouper.formatUptime(undefined)).toBe('Unknown');
		const now = Date.now();
		expect(ProjectGrouper.formatUptime(now - 45000)).toBe('0m');
		expect(ProjectGrouper.formatUptime(now - 3700000)).toBe('1h 1m');
		expect(ProjectGrouper.formatUptime(now - 90000000)).toBe('1d 1h');
	});

	it('should parse pm2Names safely with cache', () => {
		const proj = {
			pm2Names: JSON.stringify(['app-1', 'app-2'])
		} as Project;

		const names = ProjectGrouper.parsePm2Names(proj);
		expect(names).toEqual(['app-1', 'app-2']);
		// Second call returns cached result
		expect(ProjectGrouper.parsePm2Names(proj)).toEqual(['app-1', 'app-2']);
	});
});
