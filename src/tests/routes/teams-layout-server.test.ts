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

// Mock team-access functions
const mockGetTeamRole = vi.fn();
vi.mock('$lib/server/team-access', () => ({
	getTeamRole: (...args: unknown[]) => mockGetTeamRole(...args)
}));

// Import after mocking
import { load } from '../../../src/routes/(app)/teams/[id]/+layout.server.ts';
import type { LayoutServerLoad } from '../../../src/routes/(app)/teams/[id]/$types';

describe('teams/[id]/+layout.server.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should throw 404 when user is not a team member', async () => {
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

		// Mock getTeamRole to return null (not a member)
		mockGetTeamRole.mockResolvedValue(null);

		const event = {
			request: { headers: new Headers() },
			params: { id: 'team-1' }
		} as unknown as Parameters<LayoutServerLoad>[0];

		try {
			await load(event);
			expect.fail('Expected error to be thrown');
		} catch (e: unknown) {
			const err = e as { status?: number };
			expect(err.status).toBe(404);
		}

		expect(mockGetTeamRole).toHaveBeenCalledWith('user-1', 'team-1');
	});

	it('should load successfully when user is team owner', async () => {
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

		mockGetTeamRole.mockResolvedValue('team_owner');

		const event = {
			request: { headers: new Headers() },
			params: { id: 'team-1' }
		} as unknown as Parameters<LayoutServerLoad>[0];

		const result = await load(event);

		expect(mockGetTeamRole).toHaveBeenCalledWith('owner-1', 'team-1');
		expect(result).toEqual({
			user,
			session: { id: 'session-1' },
			teamId: 'team-1',
			memberRole: 'team_owner'
		});
	});

	it('should load successfully when user is team admin', async () => {
		const user = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Team Admin',
			role: 'user',
			banned: false,
			banReason: null
		};

		mockGetSession.mockResolvedValue({
			user,
			session: { id: 'session-1' }
		});

		mockGetTeamRole.mockResolvedValue('team_admin');

		const event = {
			request: { headers: new Headers() },
			params: { id: 'team-1' }
		} as unknown as Parameters<LayoutServerLoad>[0];

		const result = await load(event);

		expect(result.memberRole).toBe('team_admin');
	});

	it('should load successfully when user is team member', async () => {
		const user = {
			id: 'member-1',
			email: 'member@test.com',
			name: 'Member',
			role: 'user',
			banned: false,
			banReason: null
		};

		mockGetSession.mockResolvedValue({
			user,
			session: { id: 'session-1' }
		});

		mockGetTeamRole.mockResolvedValue('team_member');

		const event = {
			request: { headers: new Headers() },
			params: { id: 'team-1' }
		} as unknown as Parameters<LayoutServerLoad>[0];

		const result = await load(event);

		expect(result.memberRole).toBe('team_member');
	});

	it('should handle unauthenticated user', async () => {
		mockGetSession.mockResolvedValue(null);

		const event = {
			request: { headers: new Headers() },
			params: { id: 'team-1' }
		} as unknown as Parameters<LayoutServerLoad>[0];

		const result = await load(event);

		// Should return null user/session
		// Parent layout will handle the redirect
		expect(result).toEqual({
			user: null,
			session: null
		});
		expect(mockGetTeamRole).not.toHaveBeenCalled();
	});
});
