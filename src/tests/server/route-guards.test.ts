import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthUser } from '$lib/auth/provider.interface';

// Create a mock store that persists across hoisting
const mockStore = {
	findFirst: vi.fn()
};

// Mock the database module with a factory that uses the mockStore
vi.mock('$lib/db', () => ({
	db: {
		query: {
			projectMembers: {
				findFirst: (...args: unknown[]) => mockStore.findFirst(...args)
			}
		}
	}
}));

// Mock the error function from @sveltejs/kit
vi.mock('@sveltejs/kit', () => ({
	error: vi.fn((status: number, message: string) => {
		const err = new Error(message) as Error & { status: number };
		err.status = status;
		throw err;
	})
}));

// Import after mocking
import { requireAdmin, requireRole, requireProjectAccess } from '$lib/server/route-guards';

describe('requireAdmin', () => {
	it('should not throw for admin user', () => {
		const adminUser: AuthUser = {
			id: 'user-1',
			email: 'admin@test.com',
			name: 'Admin',
			emailVerified: true,
			createdAt: new Date(),
			role: 'admin',
			banned: false,
			banReason: null
		};

		expect(() => requireAdmin(adminUser)).not.toThrow();
	});

	it('should throw 403 for non-admin user', () => {
		const regularUser: AuthUser = {
			id: 'user-2',
			email: 'user@test.com',
			name: 'User',
			emailVerified: true,
			createdAt: new Date(),
			role: 'user',
			banned: false,
			banReason: null
		};

		expect(() => requireAdmin(regularUser)).toThrow();
	});

	it('should throw 403 for viewer user', () => {
		const viewerUser: AuthUser = {
			id: 'user-3',
			email: 'viewer@test.com',
			name: 'Viewer',
			emailVerified: true,
			createdAt: new Date(),
			role: 'viewer',
			banned: false,
			banReason: null
		};

		expect(() => requireAdmin(viewerUser)).toThrow();
	});
});

describe('requireRole', () => {
	it('should not throw when user has exact role', () => {
		const user: AuthUser = {
			id: 'user-1',
			email: 'user@test.com',
			name: 'User',
			emailVerified: true,
			createdAt: new Date(),
			role: 'user',
			banned: false,
			banReason: null
		};

		expect(() => requireRole(user, 'user')).not.toThrow();
	});

	it('should not throw when admin requests user role (admin has all roles)', () => {
		const admin: AuthUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			emailVerified: true,
			createdAt: new Date(),
			role: 'admin',
			banned: false,
			banReason: null
		};

		expect(() => requireRole(admin, 'user')).not.toThrow();
		expect(() => requireRole(admin, 'viewer')).not.toThrow();
	});

	it('should throw 403 when user does not have required role', () => {
		const viewer: AuthUser = {
			id: 'user-2',
			email: 'viewer@test.com',
			name: 'Viewer',
			emailVerified: true,
			createdAt: new Date(),
			role: 'viewer',
			banned: false,
			banReason: null
		};

		expect(() => requireRole(viewer, 'user')).toThrow();
		expect(() => requireRole(viewer, 'admin')).toThrow();
	});
});

describe('requireProjectAccess', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockStore.findFirst.mockClear();
	});

	it('should throw 404 when user is not a project member', async () => {
		// Mock no project membership found
		mockStore.findFirst.mockResolvedValue(null);

		await expect(requireProjectAccess('project-1', 'user-1')).rejects.toThrow();
	});

	it('should not throw when user is project owner', async () => {
		mockStore.findFirst.mockResolvedValue({
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'user-1',
			role: 'owner',
			createdAt: new Date()
		});

		await expect(requireProjectAccess('project-1', 'user-1')).resolves.not.toThrow();
	});

	it('should throw 403 when user does not have required role', async () => {
		mockStore.findFirst.mockResolvedValue({
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'user-1',
			role: 'viewer',
			createdAt: new Date()
		});

		await expect(requireProjectAccess('project-1', 'user-1', 'editor')).rejects.toThrow();
	});

	it('should not throw when user has required role', async () => {
		mockStore.findFirst.mockResolvedValue({
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'user-1',
			role: 'editor',
			createdAt: new Date()
		});

		await expect(requireProjectAccess('project-1', 'user-1', 'editor')).resolves.not.toThrow();
	});

	it('should not throw when user is member without specific role requirement', async () => {
		mockStore.findFirst.mockResolvedValue({
			id: 'pm-1',
			projectId: 'project-1',
			userId: 'user-1',
			role: 'viewer',
			createdAt: new Date()
		});

		await expect(requireProjectAccess('project-1', 'user-1')).resolves.not.toThrow();
	});
});
