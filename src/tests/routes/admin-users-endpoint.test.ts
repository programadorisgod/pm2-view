import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestHandler } from '../../../src/routes/(app)/admin/users/$types';

// Mock auth module
const mockListUsers = vi.fn();
const mockCreateUser = vi.fn();
vi.mock('$lib/auth', () => ({
	auth: {
		api: {
			listUsers: (...args: unknown[]) => mockListUsers(...args),
			createUser: (...args: unknown[]) => mockCreateUser(...args)
		}
	}
}));

// Mock requireAdmin
const mockRequireAdmin = vi.fn();
vi.mock('$lib/server/route-guards', () => ({
	requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args)
}));

// Mock audit logging
vi.mock('$lib/server/audit', () => ({
	logAudit: vi.fn().mockResolvedValue(undefined)
}));

// Mock error from @sveltejs/kit
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

// Import after mocking
import { GET, POST } from '../../../src/routes/(app)/admin/users/+server';

describe('admin/users/+server.ts - GET', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return users list with pagination when admin is authenticated', async () => {
		// Setup: Mock admin user in locals
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		// Mock listUsers response
		mockListUsers.mockResolvedValue({
			users: [
				{ id: 'user-1', email: 'user1@test.com', name: 'User 1', role: 'user' },
				{ id: 'user-2', email: 'user2@test.com', name: 'User 2', role: 'viewer' }
			],
			total: 2
		});

		// Create mock event
		const event = {
			url: new URL('http://localhost/admin/users?page=1&limit=20'),
			locals: { user: adminUser }
		} as Parameters<typeof GET>[0];

		// Execute
		const response = await GET(event);
		const data = await response.json();

		// Assert
		expect(mockRequireAdmin).toHaveBeenCalledWith(adminUser);
		expect(mockListUsers).toHaveBeenCalledWith({
			query: {
				limit: 20,
				offset: 0
			}
		});
		expect(data.users).toHaveLength(2);
		expect(data.pagination).toEqual({
			page: 1,
			limit: 20,
			total: 2,
			totalPages: 1
		});
	});

	it('should throw 401 when user is not authenticated', async () => {
		const event = {
			url: new URL('http://localhost/admin/users'),
			locals: { user: null }
		} as Parameters<typeof GET>[0];

		await expect(GET(event)).rejects.toThrow('Unauthorized');
	});

	it('should throw 403 when non-admin user tries to list users', async () => {
		const regularUser = {
			id: 'user-1',
			email: 'user@test.com',
			name: 'User',
			role: 'user',
			banned: false,
			banReason: null
		};

		// Mock requireAdmin to throw
		mockRequireAdmin.mockImplementation(() => {
			const err = new Error('403: Access denied') as Error & { status: number };
			err.status = 403;
			throw err;
		});

		const event = {
			url: new URL('http://localhost/admin/users'),
			locals: { user: regularUser }
		} as Parameters<typeof GET>[0];

		await expect(GET(event)).rejects.toThrow();
	});
});

describe('admin/users/+server.ts - POST', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset requireAdmin to not throw by default
		mockRequireAdmin.mockImplementation(() => {
			// Default: do nothing (admin check passes)
		});
	});

	it('should create a new user with default role when admin is authenticated', async () => {
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		// Mock createUser response
		mockCreateUser.mockResolvedValue({
			data: {
				id: 'new-user-1',
				email: 'newuser@test.com',
				name: 'New User',
				role: 'user'
			}
		});

		const requestBody = {
			email: 'newuser@test.com',
			password: 'password123',
			name: 'New User'
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
		expect(mockCreateUser).toHaveBeenCalledWith({
			body: {
				email: 'newuser@test.com',
				password: 'password123',
				name: 'New User',
				role: 'user' // default role
			}
		});
		expect(data.user).toBeDefined();
		expect(response.status).toBe(201);
	});

	it('should create a user with specified role', async () => {
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		mockCreateUser.mockResolvedValue({
			data: {
				id: 'new-user-2',
				email: 'admin2@test.com',
				name: 'New Admin',
				role: 'admin'
			}
		});

		const requestBody = {
			email: 'admin2@test.com',
			password: 'password123',
			name: 'New Admin',
			role: 'admin'
		};

		const event = {
			request: {
				json: () => Promise.resolve(requestBody)
			},
			locals: { user: adminUser }
		} as Parameters<typeof POST>[0];

		const response = await POST(event);
		const data = await response.json();

		expect(mockCreateUser).toHaveBeenCalledWith({
			body: {
				email: 'admin2@test.com',
				password: 'password123',
				name: 'New Admin',
				role: 'admin'
			}
		});
		expect(data.user.role).toBe('admin');
	});

	it('should throw 400 when email is invalid', async () => {
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		const requestBody = {
			email: 'invalid-email',
			password: 'password123',
			name: 'Test User'
		};

		const event = {
			request: {
				json: () => Promise.resolve(requestBody)
			},
			locals: { user: adminUser }
		} as Parameters<typeof POST>[0];

		await expect(POST(event)).rejects.toThrow();
	});

	it('should throw 409 when user already exists', async () => {
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		mockCreateUser.mockRejectedValue(new Error('User already exists'));

		const requestBody = {
			email: 'existing@test.com',
			password: 'password123',
			name: 'Existing User'
		};

		const event = {
			request: {
				json: () => Promise.resolve(requestBody)
			},
			locals: { user: adminUser }
		} as Parameters<typeof POST>[0];

		await expect(POST(event)).rejects.toThrow('already exists');
	});
});
