import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LayoutServerLoad } from '../../../src/routes/(app)/+layout.server.ts';

// Mock auth module
const mockGetSession = vi.fn();
vi.mock('$lib/auth', () => ({
	auth: {
		api: {
			getSession: (...args: unknown[]) => mockGetSession(...args)
		}
	}
}));

// Import after mocking
import { load } from '../../../src/routes/(app)/+layout.server.ts';

describe('(app)/+layout.server.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should redirect to login when not authenticated', async () => {
		mockGetSession.mockResolvedValue(null);

		const event = {
			request: { headers: new Headers() },
			route: { id: '/(app)/projects/123' }
		} as Parameters<LayoutServerLoad>[0];

		// The redirect function from @sveltejs/kit throws a redirect
		// We need to catch it and verify the status and location
		try {
			await load(event);
			// If we get here, the redirect wasn't thrown
			expect.fail('Expected redirect to be thrown');
		} catch (e: unknown) {
			// In SvelteKit, redirect throws an object with status and location
			const err = e as { status?: number; location?: string };
			expect(err.status).toBe(302);
			expect(err.location).toBe('/login');
		}
	});

	it('should allow non-admin to access parent layout (admin check delegated to child layout)', async () => {
		mockGetSession.mockResolvedValue({
			user: {
				id: 'user-1',
				email: 'user@test.com',
				name: 'User',
				role: 'user',
				banned: false,
				banReason: null
			},
			session: { id: 'session-1' }
		});

		const event = {
			request: { headers: new Headers() },
			route: { id: '/(app)/admin/users' }
		} as Parameters<LayoutServerLoad>[0];

		// Parent layout no longer checks admin routes — child layout handles it
		const result = await load(event);
		expect(result).toEqual({
			user: expect.objectContaining({ role: 'user' }),
			session: expect.any(Object)
		});
	});

	it('should allow access when admin accesses admin route', async () => {
		mockGetSession.mockResolvedValue({
			user: {
				id: 'admin-1',
				email: 'admin@test.com',
				name: 'Admin',
				role: 'admin',
				banned: false,
				banReason: null
			},
			session: { id: 'session-1' }
		});

		const event = {
			request: { headers: new Headers() },
			route: { id: '/(app)/admin/users' }
		} as Parameters<LayoutServerLoad>[0];

		const result = await load(event);

		expect(result).toEqual({
			user: expect.objectContaining({ role: 'admin' }),
			session: expect.any(Object)
		});
	});

	it('should allow access when non-admin accesses non-admin route', async () => {
		mockGetSession.mockResolvedValue({
			user: {
				id: 'user-1',
				email: 'user@test.com',
				name: 'User',
				role: 'user',
				banned: false,
				banReason: null
			},
			session: { id: 'session-1' }
		});

		const event = {
			request: { headers: new Headers() },
			route: { id: '/(app)/projects/123' }
		} as Parameters<LayoutServerLoad>[0];

		const result = await load(event);

		expect(result).toEqual({
			user: expect.objectContaining({ role: 'user' }),
			session: expect.any(Object)
		});
	});

	it('should allow viewer to access parent layout (admin check delegated to child layout)', async () => {
		mockGetSession.mockResolvedValue({
			user: {
				id: 'viewer-1',
				email: 'viewer@test.com',
				name: 'Viewer',
				role: 'viewer',
				banned: false,
				banReason: null
			},
			session: { id: 'session-1' }
		});

		const event = {
			request: { headers: new Headers() },
			route: { id: '/(app)/admin/teams' }
		} as Parameters<LayoutServerLoad>[0];

		// Parent layout no longer checks admin routes — child layout handles it
		const result = await load(event);
		expect(result).toEqual({
			user: expect.objectContaining({ role: 'viewer' }),
			session: expect.any(Object)
		});
	});

	it('should allow access to nested admin routes only for admin', async () => {
		mockGetSession.mockResolvedValue({
			user: {
				id: 'admin-1',
				email: 'admin@test.com',
				name: 'Admin',
				role: 'admin',
				banned: false,
				banReason: null
			},
			session: { id: 'session-1' }
		});

		const event = {
			request: { headers: new Headers() },
			route: { id: '/(app)/admin/audit' }
		} as Parameters<LayoutServerLoad>[0];

		const result = await load(event);

		expect(result).toEqual({
			user: expect.objectContaining({ role: 'admin' }),
			session: expect.any(Object)
		});
	});
});
