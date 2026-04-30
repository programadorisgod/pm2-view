import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestHandler } from '../../../src/routes/(app)/projects/[id]/members/$types';

// Mock database module
vi.mock('$lib/db', () => {
	return {
		db: {
			query: {
				projectMembers: {
					findMany: vi.fn(),
					findFirst: vi.fn()
				},
				projects: {
					findFirst: vi.fn()
				},
				users: {
					findFirst: vi.fn()
				}
			},
			select: vi.fn().mockReturnValue({
				from: () => ({
					where: () => Promise.resolve([{ count: 0 }])
				})
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockResolvedValue(undefined)
			}),
			update: vi.fn().mockReturnValue({
				set: () => ({
					where: () => Promise.resolve(undefined)
				})
			}),
			delete: vi.fn().mockReturnValue({
				where: () => Promise.resolve(undefined)
			}),
			$count: vi.fn()
		}
	};
});

// Mock requireProjectAccess
const mockRequireProjectAccess = vi.fn();
vi.mock('$lib/server/route-guards', () => ({
	requireProjectAccess: (...args: unknown[]) => mockRequireProjectAccess(...args)
}));

// Mock getProjectRole
const mockGetProjectRole = vi.fn();
vi.mock('$lib/server/project-access', () => ({
	getProjectRole: (...args: unknown[]) => mockGetProjectRole(...args)
}));

// Mock audit logging
vi.mock('$lib/server/audit', () => ({
	logAudit: vi.fn().mockResolvedValue(undefined)
}));

// Mock error and json from @sveltejs/kit
vi.mock('@sveltejs/kit', () => ({
	error: vi.fn((status: number, message: string) => {
		const err = new Error(message) as Error & { status: number };
		err.status = status;
		throw err;
	}),
	json: vi.fn((data: any, init?: ResponseInit) => {
		return new Response(JSON.stringify(data), {
			status: init?.status || 200,
			headers: { 'content-type': 'application/json' }
		});
	})
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', async () => {
	const actual = await vi.importActual('drizzle-orm');
	return {
		...actual,
		eq: vi.fn((field: any, value: any) => ({ field, value })),
		and: vi.fn((...args: any[]) => ({ args }))
	};
});

// Import after mocking
import { GET, POST, PATCH, DELETE } from '../../../src/routes/(app)/projects/[id]/members/+server';
import { db } from '$lib/db';

describe('projects/[id]/members/+server.ts - GET', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return project members when user has access', async () => {
		const user = {
			id: 'user-1',
			email: 'user@test.com',
			name: 'User',
			role: 'user',
			banned: false,
			banReason: null
		};

		// Mock project access
		mockRequireProjectAccess.mockResolvedValue({
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'user-1',
			role: 'owner'
		});

		// Mock members query
		const mockQuery = db.query as any;
		mockQuery.projectMembers.findMany.mockResolvedValue([
			{
				id: 'pm-1',
				projectId: 'project-1',
				userId: 'user-1',
				role: 'owner',
				createdAt: new Date('2024-01-01'),
				user: {
					id: 'user-1',
					email: 'owner@test.com',
					name: 'Owner',
					role: 'user'
				}
			},
			{
				id: 'pm-2',
				projectId: 'project-1',
				userId: 'user-2',
				role: 'editor',
				createdAt: new Date('2024-01-02'),
				user: {
					id: 'user-2',
					email: 'editor@test.com',
					name: 'Editor',
					role: 'user'
				}
			}
		]);

		const event = {
			params: { id: 'project-1' },
			locals: { user }
		} as Parameters<typeof GET>[0];

		const response = await GET(event);
		const data = await response.json();

		expect(mockRequireProjectAccess).toHaveBeenCalledWith('project-1', 'user-1');
		expect(data.members).toHaveLength(2);
		expect(data.members[0].role).toBe('owner');
		expect(data.members[1].role).toBe('editor');
	});

	it('should throw 401 when user is not authenticated', async () => {
		const event = {
			params: { id: 'project-1' },
			locals: { user: null }
		} as Parameters<typeof GET>[0];

		await expect(GET(event)).rejects.toThrow('Unauthorized');
	});
});

describe('projects/[id]/members/+server.ts - POST (invite)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetProjectRole.mockReturnValue('owner');
	});

	it('should invite a user to project when owner invites', async () => {
		const owner = {
			id: 'owner-1',
			email: 'owner@test.com',
			name: 'Owner',
			role: 'user',
			banned: false,
			banReason: null
		};

		// Mock project exists
		const mockQuery = db.query as any;
		mockQuery.projects.findFirst.mockResolvedValue({
			id: 'project-1',
			name: 'Test Project'
		});

		// Mock target user exists
		mockQuery.users.findFirst.mockResolvedValue({
			id: 'user-3',
			email: 'newuser@test.com',
			name: 'New User'
		});

		// Mock not already a member
		mockQuery.projectMembers.findFirst.mockResolvedValue(null);

		const requestBody = {
			userId: 'user-3',
			role: 'editor'
		};

		const event = {
			params: { id: 'project-1' },
			request: {
				json: () => Promise.resolve(requestBody)
			},
			locals: { user: owner }
		} as Parameters<typeof POST>[0];

		const response = await POST(event);
		const data = await response.json();

		expect(data.member).toBeDefined();
		expect(data.member.role).toBe('editor');
		expect(response.status).toBe(201);
	});

	it('should throw 403 when viewer tries to invite', async () => {
		const viewer = {
			id: 'viewer-1',
			email: 'viewer@test.com',
			name: 'Viewer',
			role: 'viewer',
			banned: false,
			banReason: null
		};

		mockGetProjectRole.mockReturnValue('viewer');

		const requestBody = {
			userId: 'user-3',
			role: 'viewer'
		};

		const event = {
			params: { id: 'project-1' },
			request: {
				json: () => Promise.resolve(requestBody)
			},
			locals: { user: viewer }
		} as Parameters<typeof POST>[0];

		await expect(POST(event)).rejects.toThrow('Insufficient permissions');
	});

	it('should throw 409 when user is already a member', async () => {
		const owner = {
			id: 'owner-1',
			email: 'owner@test.com',
			name: 'Owner',
			role: 'user',
			banned: false,
			banReason: null
		};

		const mockQuery = db.query as any;
		mockQuery.projects.findFirst.mockResolvedValue({
			id: 'project-1',
			name: 'Test Project'
		});

		mockQuery.users.findFirst.mockResolvedValue({
			id: 'user-2',
			email: 'user2@test.com',
			name: 'User 2'
		});

		// Mock already a member
		mockQuery.projectMembers.findFirst.mockResolvedValue({
			id: 'pm-2',
			userId: 'user-2',
			projectId: 'project-1'
		});

		const requestBody = {
			userId: 'user-2',
			role: 'editor'
		};

		const event = {
			params: { id: 'project-1' },
			request: {
				json: () => Promise.resolve(requestBody)
			},
			locals: { user: owner }
		} as Parameters<typeof POST>[0];

		await expect(POST(event)).rejects.toThrow('already a member');
	});
});

describe('projects/[id]/members/+server.ts - PATCH (update role)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetProjectRole.mockReturnValue('owner');
	});

	it('should update member role when owner requests', async () => {
		const owner = {
			id: 'owner-1',
			email: 'owner@test.com',
			name: 'Owner',
			role: 'user',
			banned: false,
			banReason: null
		};

		const mockQuery = db.query as any;
		// Mock existing member
		mockQuery.projectMembers.findFirst.mockResolvedValue({
			id: 'pm-2',
			projectId: 'project-1',
			userId: 'user-2',
			role: 'editor'
		});

		// Mock owner count (more than 1)
		(db.select as any).mockReturnValue({
			from: () => ({
				where: () => Promise.resolve([{ count: 2 }])
			})
		});

		const event = {
			params: { id: 'project-1' },
			request: {
				json: () => Promise.resolve({ userId: 'user-2', role: 'owner' })
			},
			locals: { user: owner }
		} as Parameters<typeof PATCH>[0];

		const response = await PATCH(event);
		const data = await response.json();

		expect(data.success).toBe(true);
	});

	it('should throw 403 when trying to remove last owner', async () => {
		const owner = {
			id: 'owner-1',
			email: 'owner@test.com',
			name: 'Owner',
			role: 'user',
			banned: false,
			banReason: null
		};

		const mockQuery = db.query as any;
		mockQuery.projectMembers.findFirst.mockResolvedValue({
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'owner-1',
			role: 'owner'
		});

		// Mock owner count (only 1)
		(db.select as any).mockReturnValue({
			from: () => ({
				where: () => Promise.resolve([{ count: 1 }])
			})
		});

		const event = {
			params: { id: 'project-1' },
			request: {
				json: () => Promise.resolve({ userId: 'owner-1', role: 'editor' })
			},
			locals: { user: owner }
		} as Parameters<typeof PATCH>[0];

		await expect(PATCH(event)).rejects.toThrow('last project owner');
	});
});

describe('projects/[id]/members/+server.ts - DELETE (remove member)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetProjectRole.mockReturnValue('owner');
	});

	it('should remove member when owner requests', async () => {
		const owner = {
			id: 'owner-1',
			email: 'owner@test.com',
			name: 'Owner',
			role: 'user',
			banned: false,
			banReason: null
		};

		const mockQuery = db.query as any;
		mockQuery.projectMembers.findFirst.mockResolvedValue({
			id: 'pm-2',
			projectId: 'project-1',
			userId: 'user-2',
			role: 'editor'
		});

		const event = {
			params: { id: 'project-1' },
			request: {
				url: new URL('http://localhost/projects/project-1/members?userId=user-2')
			},
			locals: { user: owner }
		} as Parameters<typeof DELETE>[0];

		const response = await DELETE(event);
		const data = await response.json();

		expect(data.success).toBe(true);
	});

	it('should throw 403 when trying to remove last owner', async () => {
		const owner = {
			id: 'owner-1',
			email: 'owner@test.com',
			name: 'Owner',
			role: 'user',
			banned: false,
			banReason: null
		};

		const mockQuery = db.query as any;
		mockQuery.projectMembers.findFirst.mockResolvedValue({
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'owner-1',
			role: 'owner'
		});

		// Mock owner count (only 1)
		(db.select as any).mockReturnValue({
			from: () => ({
				where: () => Promise.resolve([{ count: 1 }])
			})
		});

		const event = {
			params: { id: 'project-1' },
			request: {
				url: new URL('http://localhost/projects/project-1/members?userId=owner-1')
			},
			locals: { user: owner }
		} as Parameters<typeof DELETE>[0];

		await expect(DELETE(event)).rejects.toThrow('last project owner');
	});
});
