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

	it('should throw 404 when user is not a project member', async () => {
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

		// Mock requireProjectAccess to throw 404
		mockRequireProjectAccess.mockImplementation(() => {
			throw { status: 404, body: { message: 'Project not found' } };
		});

		const event = {
			request: { headers: new Headers() },
			params: { id: 'project-1' }
		} as unknown as Parameters<LayoutServerLoad>[0];

		try {
			await load(event);
			expect.fail('Expected error to be thrown');
		} catch (e: unknown) {
			const err = e as { status?: number };
			expect(err.status).toBe(404);
		}

		expect(mockRequireProjectAccess).toHaveBeenCalledWith('project-1', 'user-1');
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

		// Mock requireProjectAccess to return member data
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

		expect(mockRequireProjectAccess).toHaveBeenCalledWith('project-1', 'user-1');
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

		mockGetSession.mockResolvedValue({
			user,
			session: { id: 'session-1' }
		});

		mockRequireProjectAccess.mockResolvedValue({
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'owner-1',
			role: 'owner',
			createdAt: new Date()
		});

		const event = {
			request: { headers: new Headers() },
			params: { id: 'project-1' }
		} as unknown as Parameters<LayoutServerLoad>[0];

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

		mockGetSession.mockResolvedValue({
			user,
			session: { id: 'session-1' }
		});

		mockRequireProjectAccess.mockResolvedValue({
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'viewer-1',
			role: 'viewer',
			createdAt: new Date()
		});

		const event = {
			request: { headers: new Headers() },
			params: { id: 'project-1' }
		} as unknown as Parameters<LayoutServerLoad>[0];

		const result = await load(event);

		expect(result.memberRole).toBe('viewer');
	});
});
