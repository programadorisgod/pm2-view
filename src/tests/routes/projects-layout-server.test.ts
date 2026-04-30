import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth module
const mockGetSession = vi.fn();
vi.mock('$lib/auth', () => ({
	auth: {
		api: {
			getSession: (...args: unknown[]) => mockGetSession(...args)
		}
	}
}));

// Mock route-guards
const mockRequireProjectAccess = vi.fn();
vi.mock('$lib/server/route-guards', () => ({
	requireProjectAccess: (...args: unknown[]) => mockRequireProjectAccess(...args)
}));

// Import after mocking
import { load } from '../../../src/routes/(app)/projects/[id]/+layout.server.ts';
import type { LayoutServerLoad } from '../../../src/routes/(app)/projects/[id]/$types';

describe('projects/[id]/+layout.server.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should throw 403 when user is not a project member', async () => {
		const user = {
			id: 'user-1',
			email: 'user@test.com',
			name: 'User',
			role: 'user',
			banned: false,
			banReason: null
		};

		mockGetSession.mockResolvedValue({
			user,
			session: { id: 'session-1' }
		});

		mockRequireProjectAccess.mockImplementation(() => {
			throw { status: 403, body: { message: 'You do not have access to this project' } };
		});

		const event = {
			request: { headers: new Headers() },
			params: { id: 'project-1' }
		} as unknown as Parameters<LayoutServerLoad>[0];

		await expect(load(event)).rejects.toMatchObject({ status: 403 });
		expect(mockRequireProjectAccess).toHaveBeenCalledWith('project-1', user);
	});

	it('should load successfully when user is project member', async () => {
		const user = {
			id: 'user-1',
			email: 'user@test.com',
			name: 'User',
			role: 'user',
			banned: false,
			banReason: null
		};

		mockGetSession.mockResolvedValue({
			user,
			session: { id: 'session-1' }
		});

		mockRequireProjectAccess.mockResolvedValue({
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'user-1',
			role: 'editor',
			createdAt: new Date()
		});

		const event = {
			request: { headers: new Headers() },
			params: { id: 'project-1' }
		} as unknown as Parameters<LayoutServerLoad>[0];

		const result = await load(event);

		expect(mockRequireProjectAccess).toHaveBeenCalledWith('project-1', user);
		expect(result).toEqual({
			user,
			session: { id: 'session-1' },
			projectId: 'project-1',
			memberRole: 'editor'
		});
	});

	it('should handle owner role', async () => {
		const user = {
			id: 'owner-1',
			email: 'owner@test.com',
			name: 'Owner',
			role: 'user',
			banned: false,
			banReason: null
		};

		mockGetSession.mockResolvedValue({ user, session: { id: 'session-1' } });
		mockRequireProjectAccess.mockResolvedValue({
			id: 'pm-1', projectId: 'project-1', userId: 'owner-1', role: 'owner', createdAt: new Date()
		});

		const event = { request: { headers: new Headers() }, params: { id: 'project-1' } } as unknown as Parameters<LayoutServerLoad>[0];
		const result = await load(event);

		expect(result.memberRole).toBe('owner');
	});

	it('should handle viewer role', async () => {
		const user = {
			id: 'viewer-1',
			email: 'viewer@test.com',
			name: 'Viewer',
			role: 'viewer',
			banned: false,
			banReason: null
		};

		mockGetSession.mockResolvedValue({ user, session: { id: 'session-1' } });
		mockRequireProjectAccess.mockResolvedValue({
			id: 'pm-1', projectId: 'project-1', userId: 'viewer-1', role: 'viewer', createdAt: new Date()
		});

		const event = { request: { headers: new Headers() }, params: { id: 'project-1' } } as unknown as Parameters<LayoutServerLoad>[0];
		const result = await load(event);

		expect(result.memberRole).toBe('viewer');
	});

	it('should handle admin role with member record', async () => {
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		mockGetSession.mockResolvedValue({ user: adminUser, session: { id: 'session-1' } });
		mockRequireProjectAccess.mockResolvedValue({
			id: 'pm-1', projectId: 'project-1', userId: 'admin-1', role: 'editor', createdAt: new Date()
		});

		const event = { request: { headers: new Headers() }, params: { id: 'project-1' } } as unknown as Parameters<LayoutServerLoad>[0];
		const result = await load(event);

		expect(result.memberRole).toBe('admin'); // Admin always gets 'admin' role
	});

	it('should handle admin role without member record', async () => {
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		mockGetSession.mockResolvedValue({ user: adminUser, session: { id: 'session-1' } });
		mockRequireProjectAccess.mockResolvedValue(undefined); // No member record for admin

		const event = { request: { headers: new Headers() }, params: { id: 'project-1' } } as unknown as Parameters<LayoutServerLoad>[0];
		const result = await load(event);

		expect(result.memberRole).toBe('admin');
	});
});
