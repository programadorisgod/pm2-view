import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TeamMember } from '$lib/db/schema';

// Create mock functions for each table
const mockTeamMembersFindFirst = vi.fn();
const mockTeamMembersFindMany = vi.fn();

// Mock the database module
vi.mock('$lib/db', () => ({
	db: {
		query: {
			teamMembers: {
				findFirst: (...args: unknown[]) => mockTeamMembersFindFirst(...args),
				findMany: (...args: unknown[]) => mockTeamMembersFindMany(...args)
			}
		}
	}
}));

// Import after mocking
import { getTeamRole, isTeamMember, canManageTeam } from '$lib/server/team-access';

describe('getTeamRole', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTeamMembersFindFirst.mockClear();
	});

	it('should return role when user is team member', async () => {
		const mockMember: TeamMember = {
			id: 'tm-1',
			teamId: 'team-1',
			userId: 'user-1',
			role: 'team_admin',
			createdAt: new Date()
		};

		mockTeamMembersFindFirst.mockResolvedValue(mockMember);

		const role = await getTeamRole('user-1', 'team-1');
		
		expect(role).toBe('team_admin');
		expect(mockTeamMembersFindFirst).toHaveBeenCalledOnce();
	});

	it('should return null when user is not team member', async () => {
		mockTeamMembersFindFirst.mockResolvedValue(null);

		const role = await getTeamRole('user-1', 'team-2');
		
		expect(role).toBeNull();
	});

	it('should return team_owner role', async () => {
		const mockMember: TeamMember = {
			id: 'tm-2',
			teamId: 'team-1',
			userId: 'user-2',
			role: 'team_owner',
			createdAt: new Date()
		};

		mockTeamMembersFindFirst.mockResolvedValue(mockMember);

		const role = await getTeamRole('user-2', 'team-1');
		
		expect(role).toBe('team_owner');
	});

	it('should return team_member role', async () => {
		const mockMember: TeamMember = {
			id: 'tm-3',
			teamId: 'team-1',
			userId: 'user-3',
			role: 'team_member',
			createdAt: new Date()
		};

		mockTeamMembersFindFirst.mockResolvedValue(mockMember);

		const role = await getTeamRole('user-3', 'team-1');
		
		expect(role).toBe('team_member');
	});
});

describe('isTeamMember', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTeamMembersFindFirst.mockClear();
	});

	it('should return true when user is team member', async () => {
		const mockMember: TeamMember = {
			id: 'tm-1',
			teamId: 'team-1',
			userId: 'user-1',
			role: 'team_member',
			createdAt: new Date()
		};

		mockTeamMembersFindFirst.mockResolvedValue(mockMember);

		const result = await isTeamMember('user-1', 'team-1');
		
		expect(result).toBe(true);
	});

	it('should return false when user is not team member', async () => {
		mockTeamMembersFindFirst.mockResolvedValue(null);

		const result = await isTeamMember('user-1', 'team-1');
		
		expect(result).toBe(false);
	});
});

describe('canManageTeam', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTeamMembersFindFirst.mockClear();
	});

	it('should return true for team_owner', async () => {
		const mockMember: TeamMember = {
			id: 'tm-1',
			teamId: 'team-1',
			userId: 'user-1',
			role: 'team_owner',
			createdAt: new Date()
		};

		mockTeamMembersFindFirst.mockResolvedValue(mockMember);

		const result = await canManageTeam('user-1', 'team-1');
		
		expect(result).toBe(true);
	});

	it('should return true for team_admin', async () => {
		const mockMember: TeamMember = {
			id: 'tm-2',
			teamId: 'team-1',
			userId: 'user-2',
			role: 'team_admin',
			createdAt: new Date()
		};

		mockTeamMembersFindFirst.mockResolvedValue(mockMember);

		const result = await canManageTeam('user-2', 'team-1');
		
		expect(result).toBe(true);
	});

	it('should return false for team_member', async () => {
		const mockMember: TeamMember = {
			id: 'tm-3',
			teamId: 'team-1',
			userId: 'user-3',
			role: 'team_member',
			createdAt: new Date()
		};

		mockTeamMembersFindFirst.mockResolvedValue(mockMember);

		const result = await canManageTeam('user-3', 'team-1');
		
		expect(result).toBe(false);
	});

	it('should return false for non-member', async () => {
		mockTeamMembersFindFirst.mockResolvedValue(null);

		const result = await canManageTeam('user-4', 'team-1');
		
		expect(result).toBe(false);
	});
});
