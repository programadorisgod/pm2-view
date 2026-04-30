import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectMember } from '$lib/db/schema';

// Create separate mock functions for each table
const mockProjectMembersFindFirst = vi.fn();
const mockProjectsFindFirst = vi.fn();

// Mock the database module with separate mocks for each table
vi.mock('$lib/db', () => ({
	db: {
		query: {
			projectMembers: {
				findFirst: (...args: unknown[]) => mockProjectMembersFindFirst(...args)
			},
			projects: {
				findFirst: (...args: unknown[]) => mockProjectsFindFirst(...args)
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

		const role = await getProjectRole('user-1', 'project-2');
		
		expect(role).toBeNull();
	});

	it('should return owner role when user is project creator', async () => {
		// Mock no project_members entry, but project.userId matches
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'user-1' });

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
		// Admin bypass — no member record, not project creator
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user' });

		const role = await getProjectRole('admin-1', 'project-1', 'admin');
		
		expect(role).toBe('owner');
		// Should NOT query project_members or projects for admin
		expect(mockProjectMembersFindFirst).not.toHaveBeenCalled();
	});
});

describe('isProjectMember', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockProjectMembersFindFirst.mockClear();
		mockProjectsFindFirst.mockClear();
	});

	it('should return true when user is project member', async () => {
		const mockMember: ProjectMember = {
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'user-1',
			role: 'viewer',
			createdAt: new Date()
		};

		mockProjectMembersFindFirst.mockResolvedValue(mockMember);

		const result = await isProjectMember('user-1', 'project-1');
		
		expect(result).toBe(true);
	});

	it('should return true when user is project creator (owner)', async () => {
		// No project_members entry, but project.userId matches
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'user-1' });

		const result = await isProjectMember('user-1', 'project-1');
		
		expect(result).toBe(true);
	});

	it('should return false when user is not a member', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user' });

		const result = await isProjectMember('user-1', 'project-1');
		
		expect(result).toBe(false);
	});

	it('should return false when project does not exist', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue(null);

		const result = await isProjectMember('user-1', 'non-existent');
		
		expect(result).toBe(false);
	});
});

describe('canAccessProject', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockProjectMembersFindFirst.mockClear();
		mockProjectsFindFirst.mockClear();
	});

	it('should return true for project member', async () => {
		const mockMember: ProjectMember = {
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'user-1',
			role: 'editor',
			createdAt: new Date()
		};

		mockProjectMembersFindFirst.mockResolvedValue(mockMember);

		const result = await canAccessProject('user-1', 'project-1');
		
		expect(result).toBe(true);
	});

	it('should return true for project creator', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'user-1' });

		const result = await canAccessProject('user-1', 'project-1');
		
		expect(result).toBe(true);
	});

	it('should return false for non-member', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue({ userId: 'other-user' });

		const result = await canAccessProject('user-1', 'project-1');
		
		expect(result).toBe(false);
	});

	it('should return false for non-existent project', async () => {
		mockProjectMembersFindFirst.mockResolvedValue(null);
		mockProjectsFindFirst.mockResolvedValue(null);

		const result = await canAccessProject('user-1', 'non-existent');
		
		expect(result).toBe(false);
	});
});
