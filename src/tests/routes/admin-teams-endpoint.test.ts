import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestHandler } from '../../../src/routes/(app)/admin/teams/$types';

// Mock database module with factory function (properly hoisted)
vi.mock('$lib/db', () => {
	const mockDbQuery = {
		teams: {
			findMany: vi.fn(),
			findFirst: vi.fn()
		}
	};

	return {
		db: {
			query: mockDbQuery,
			select: vi.fn().mockReturnValue({
				from: () => Promise.resolve([{ count: 0 }])
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockResolvedValue(undefined)
			}),
			$count: vi.fn()
		}
	};
});

// Mock requireAdmin
const mockRequireAdmin = vi.fn();
vi.mock('$lib/server/route-guards', () => ({
	requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args)
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

// Mock drizzle-orm - need to provide all exports used
vi.mock('drizzle-orm', async () => {
	const actual = await vi.importActual('drizzle-orm');
	return {
		...actual,
		eq: vi.fn((field: any, value: any) => ({ field, value })),
		and: vi.fn((...args: any[]) => ({ args }))
	};
});

// Import after mocking
import { GET, POST } from '../../../src/routes/(app)/admin/teams/+server';
import { db } from '$lib/db';

describe('admin/teams/+server.ts - GET', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return teams list with pagination when admin is authenticated', async () => {
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		// Mock teams query response
		const mockQuery = db.query as any;
		mockQuery.teams.findMany.mockResolvedValue([
			{
				id: 'team-1',
				name: 'Engineering',
				description: 'Engineering team',
				createdAt: new Date('2024-01-01'),
				teamMembers: [
					{ userId: 'user-1', role: 'team_owner' },
					{ userId: 'user-2', role: 'team_member' }
				]
			},
			{
				id: 'team-2',
				name: 'Design',
				description: null,
				createdAt: new Date('2024-01-02'),
				teamMembers: []
			}
		]);

		// Mock count query
		(db.select as any).mockReturnValue({
			from: () => Promise.resolve([{ count: 2 }])
		});

		const event = {
			url: new URL('http://localhost/admin/teams?page=1&limit=20'),
			locals: { user: adminUser }
		} as Parameters<typeof GET>[0];

		const response = await GET(event);
		const data = await response.json();

		expect(mockRequireAdmin).toHaveBeenCalledWith(adminUser);
		expect(data.teams).toHaveLength(2);
		expect(data.teams[0].name).toBe('Engineering');
		expect(data.teams[0].memberCount).toBe(2);
		expect(data.teams[1].memberCount).toBe(0);
		expect(data.pagination).toEqual({
			page: 1,
			limit: 20,
			total: 2,
			totalPages: 1
		});
	});

	it('should throw 401 when user is not authenticated', async () => {
		const event = {
			url: new URL('http://localhost/admin/teams'),
			locals: { user: null }
		} as Parameters<typeof GET>[0];

		await expect(GET(event)).rejects.toThrow('Unauthorized');
	});
});

describe('admin/teams/+server.ts - POST', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAdmin.mockImplementation(() => {});
	});

	it('should create a new team when admin is authenticated', async () => {
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		// Mock no existing team with same name
		const mockQuery = db.query as any;
		mockQuery.teams.findFirst.mockResolvedValue(null);

		// Mock insert
		const mockValues = vi.fn().mockResolvedValue(undefined);
		(db.insert as any).mockReturnValue({ values: mockValues });

		const requestBody = {
			name: 'New Team',
			description: 'A new team'
		};

		const event = {
			request: {
				json: () => Promise.resolve(requestBody)
			},
			locals: { user: adminUser }
		} as Parameters<typeof POST>[0];

		const response = await POST(event);
		const data = await response.json();

		expect(mockRequireAdmin).toHaveBeenCalledWith(adminUser);
		expect(data.team).toBeDefined();
		expect(data.team.name).toBe('New Team');
		expect(response.status).toBe(201);
	});

	it('should throw 409 when team name already exists', async () => {
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		// Mock existing team with same name
		const mockQuery = db.query as any;
		mockQuery.teams.findFirst.mockResolvedValue({
			id: 'existing-team',
			name: 'Existing Team'
		});

		const requestBody = {
			name: 'Existing Team',
			description: 'Some description'
		};

		const event = {
			request: {
				json: () => Promise.resolve(requestBody)
			},
			locals: { user: adminUser }
		} as Parameters<typeof POST>[0];

		await expect(POST(event)).rejects.toThrow('already exists');
	});

	it('should throw 400 when team name is empty', async () => {
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		const requestBody = {
			name: '',
			description: 'Some description'
		};

		const event = {
			request: {
				json: () => Promise.resolve(requestBody)
			},
			locals: { user: adminUser }
		} as Parameters<typeof POST>[0];

		await expect(POST(event)).rejects.toThrow();
	});
});
