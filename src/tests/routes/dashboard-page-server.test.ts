import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PageServerLoad } from '../../../src/routes/(app)/$types';
import type { VisibleProject } from '../../../src/lib/services/project-listing.service';

// Mocks must be hoisted — use vi.hoisted for shared state
const mocks = vi.hoisted(() => ({
	getVisibleProjects: vi.fn(),
	getSummary: vi.fn()
}));

// Mock auth module
vi.mock('$lib/auth', () => ({
	auth: {
		api: {
			getSession: vi.fn()
		}
	}
}));

// Mock project listing service
vi.mock('$lib/services/project-listing.service', () => ({
	createProjectListingService: vi.fn().mockReturnValue({
		getVisibleProjects: mocks.getVisibleProjects
	}),
	ProjectListingService: vi.fn()
}));

// Mock PM2 service (still needed for getSummary)
vi.mock('$lib/services/factory', () => ({
	createServices: () => ({
		pm2Service: {
			getSummary: mocks.getSummary
		}
	})
}));

// Import after mocking
import { load } from '../../../src/routes/(app)/+page.server.ts';
import { auth } from '$lib/auth';

describe('Dashboard +page.server.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should use ProjectListingService for filtered access', async () => {
		// Mock session with non-admin user
		vi.mocked(auth.api.getSession).mockResolvedValue({
			user: { id: 'user-123', name: 'Test User', email: 'test@example.com', role: 'user' },
			session: { id: 'session-1', userId: 'user-123', createdAt: new Date(), updatedAt: new Date() }
		});

		// Mock visible projects (filtered result)
		const mockProjects: VisibleProject[] = [
			{
				name: 'my-app',
				pm_id: 1,
				monit: { cpu: 10, memory: 1024 },
				pm2_env: { status: 'online', pm_uptime: Date.now(), restart_time: 0 },
				status: 'online',
				cpu: 10,
				memoryMB: 1,
				uptimeFormatted: '1h 0m',
				accessType: 'personal',
				dbProject: undefined,
				teamName: undefined
			}
		];
		mocks.getVisibleProjects.mockResolvedValue(mockProjects);

		// Mock summary
		mocks.getSummary.mockReturnValue({ total: 1, running: 1, stopped: 0, errored: 0 });

		const event = {
			locals: {
				user: { id: 'user-123', name: 'Test User', email: 'test@example.com', role: 'user' }
			},
			request: { headers: new Headers() }
		} as Parameters<PageServerLoad>[0];

		const result = await load(event);

		// Verify ProjectListingService was called (not direct pm2Service.getAllProcesses)
		expect(mocks.getVisibleProjects).toHaveBeenCalledWith('user-123', 'user');
		expect(result.processes).toHaveLength(1);
		expect(result.processes[0].name).toBe('my-app');
	});

	it('should work for admin users (admin bypass)', async () => {
		// Mock session with admin user
		vi.mocked(auth.api.getSession).mockResolvedValue({
			user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
			session: { id: 'session-2', userId: 'admin-1', createdAt: new Date(), updatedAt: new Date() }
		});

		// Mock visible projects (admin sees all)
		const mockProjects: VisibleProject[] = [
			{
				name: 'app1',
				pm_id: 1,
				monit: { cpu: 10, memory: 1024 },
				pm2_env: { status: 'online', pm_uptime: Date.now(), restart_time: 0 },
				status: 'online',
				cpu: 10,
				memoryMB: 1,
				uptimeFormatted: '1h 0m',
				accessType: 'admin',
				dbProject: undefined,
				teamName: undefined
			},
			{
				name: 'app2',
				pm_id: 2,
				monit: { cpu: 5, memory: 512 },
				pm2_env: { status: 'stopped', pm_uptime: 0, restart_time: 1 },
				status: 'stopped',
				cpu: 5,
				memoryMB: 0.5,
				uptimeFormatted: 'N/A',
				accessType: 'admin',
				dbProject: undefined,
				teamName: undefined
			}
		];
		mocks.getVisibleProjects.mockResolvedValue(mockProjects);
		mocks.getSummary.mockReturnValue({ total: 2, running: 1, stopped: 1, errored: 0 });

		const event = {
			locals: {
				user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' }
			},
			request: { headers: new Headers() }
		} as Parameters<PageServerLoad>[0];

		const result = await load(event);

		expect(mocks.getVisibleProjects).toHaveBeenCalledWith('admin-1', 'admin');
		expect(result.processes).toHaveLength(2);
	});
});
