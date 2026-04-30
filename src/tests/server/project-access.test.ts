import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectMember } from '$lib/db/schema';

// Create separate mock functions for each table
const mockProjectMembersFindFirst = vi.fn();
const mockProjectsFindFirst = vi.fn();
const mockTeamMembersFindFirst = vi.fn();

// Mock the database module with separate mocks for each table
vi.mock('$lib/db', () => ({
	db: {
		query: {
			projectMembers: {
				findFirst: (...args: unknown[]) => mockProjectMembersFindFirst(...args)
			},
			projects: {
				findFirst: (...args: unknown[]) => mockProjectsFindFirst(...args)
			},
			teamMembers: {
				findFirst: (...args: unknown[]) => mockTeamMembersFindFirst(...args)
			}
		}
	}
}));

// Import after mocking
import { getProjectRole, isProjectMember, canAccessProject } from '$lib/server/project-access';

describe('getProjectRole', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockProjectMembersFindFirst.mockClear();
		mockProjectsFindFirst.mockClear();
		mockTeamMembersFindFirst.mockClear();
	});

	it('should return role when user is project member', async () => {
		const mockMember: ProjectMember = {
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'user-1',
			role: 'editor',
			createdAt: new Date()
		};

		mockProjectMembersFindFirst.mockResolvedValue(mockMember);

		const role = await getProjectRole('user-1', 'project-1');
		
		expect(role).toBe('editor');
		expect(mockProjectMembersFindFirst).toHaveBeenCalledOnce();
	});

	it('should return null when user is not project member', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user', teamId: null });

		const role = await getProjectRole('user-1', 'project-2');
		
		expect(role).toBeNull();
	});

	it('should return owner role when user is project creator', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'user-1', teamId: null });

		const role = await getProjectRole('user-1', 'project-1');
		
		expect(role).toBe('owner');
	});

	it('should return null when project does not exist', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue(null);

		const role = await getProjectRole('user-1', 'non-existent');
		
		expect(role).toBeNull();
	});

	it('should return owner when global role is admin', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user', teamId: null });

		const role = await getProjectRole('admin-1', 'project-1', 'admin');
		
		expect(role).toBe('owner');
		expect(mockProjectMembersFindFirst).not.toHaveBeenCalled();
	});

	it('should return owner when user is team_owner of project team', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user', teamId: 'team-1' });
		mockTeamMembersFindFirst.mockResolvedValue({ userId: 'user-1', teamId: 'team-1', role: 'team_owner' });

		const role = await getProjectRole('user-1', 'project-1');
		
		expect(role).toBe('owner');
		expect(mockTeamMembersFindFirst).toHaveBeenCalled();
	});

	it('should return editor when user is team_admin of project team', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user', teamId: 'team-1' });
		mockTeamMembersFindFirst.mockResolvedValue({ userId: 'user-1', teamId: 'team-1', role: 'team_admin' });

		const role = await getProjectRole('user-1', 'project-1');
		
		expect(role).toBe('editor');
	});

	it('should return viewer when user is team_member of project team', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user', teamId: 'team-1' });
		mockTeamMembersFindFirst.mockResolvedValue({ userId: 'user-1', teamId: 'team-1', role: 'team_member' });

		const role = await getProjectRole('user-1', 'project-1');
		
		expect(role).toBe('viewer');
	});

	it('should return null when user is not in project team', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user', teamId: 'team-1' });
		mockTeamMembersFindFirst.mockResolvedValue(null);

		const role = await getProjectRole('user-1', 'project-1');
		
		expect(role).toBeNull();
	});

	it('should prefer direct project_members over team role', async () => {
		mockProjectMembersFindFirst.mockResolvedValue({
			id: 'pm-1', projectId: 'project-1', userId: 'user-1', role: 'editor', createdAt: new Date()
		});
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user', teamId: 'team-1' });

		const role = await getProjectRole('user-1', 'project-1');
		
		expect(role).toBe('editor'); // From project_members, not team
		expect(mockTeamMembersFindFirst).not.toHaveBeenCalled();
	});
});

describe('isProjectMember', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockProjectMembersFindFirst.mockClear();
		mockProjectsFindFirst.mockClear();
		mockTeamMembersFindFirst.mockClear();
	});

	it('should return true when user is project member', async () => {
		mockProjectMembersFindFirst.mockResolvedValue({
			id: 'pm-1', projectId: 'project-1', userId: 'user-1', role: 'viewer', createdAt: new Date()
		});

		expect(await isProjectMember('user-1', 'project-1')).toBe(true);
	});

	it('should return true when user is project creator (owner)', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'user-1', teamId: null });

		expect(await isProjectMember('user-1', 'project-1')).toBe(true);
	});

	it('should return true when user is team member of project team', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user', teamId: 'team-1' });
		mockTeamMembersFindFirst.mockResolvedValue({ userId: 'user-1', teamId: 'team-1', role: 'team_member' });

		expect(await isProjectMember('user-1', 'project-1')).toBe(true);
	});

	it('should return false when user is not a member', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user', teamId: null });

		expect(await isProjectMember('user-1', 'project-1')).toBe(false);
	});

	it('should return false when project does not exist', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue(null);

		expect(await isProjectMember('user-1', 'non-existent')).toBe(false);
	});
});

describe('canAccessProject', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockProjectMembersFindFirst.mockClear();
		mockProjectsFindFirst.mockClear();
		mockTeamMembersFindFirst.mockClear();
	});

	it('should return true for project member', async () => {
		mockProjectMembersFindFirst.mockResolvedValue({
			id: 'pm-1', projectId: 'project-1', userId: 'user-1', role: 'editor', createdAt: new Date()
		});

		expect(await canAccessProject('user-1', 'project-1')).toBe(true);
	});

	it('should return true for project creator', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'user-1', teamId: null });

		expect(await canAccessProject('user-1', 'project-1')).toBe(true);
	});

	it('should return true for team member of project team', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user', teamId: 'team-1' });
		mockTeamMembersFindFirst.mockResolvedValue({ userId: 'user-1', teamId: 'team-1', role: 'team_member' });

		expect(await canAccessProject('user-1', 'project-1')).toBe(true);
	});

	it('should return false for non-member', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user', teamId: null });

		expect(await canAccessProject('user-1', 'project-1')).toBe(false);
	});

	it('should return false for non-existent project', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue(null);

		expect(await canAccessProject('user-1', 'non-existent')).toBe(false);
	});
});
