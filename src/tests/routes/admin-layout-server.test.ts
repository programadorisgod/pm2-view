import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock requireAdmin from route-guards (not used anymore but keep for compatibility)
const mockRequireAdmin = vi.fn();
vi.mock('$lib/server/route-guards', () => ({
	requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args)
}));

// Import after mocking
import { load } from '../../../src/routes/(app)/admin/+layout.server.ts';

describe('admin/+layout.server.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return user and isAdmin=true when admin accesses admin route', async () => {
		const adminUser = {
			id: 'admin-1',
			email: 'admin@test.com',
			name: 'Admin',
			role: 'admin',
			banned: false,
			banReason: null
		};

		const event = {
			locals: { user: adminUser }
		} as any;

		const result = await load(event);

		expect(result).toEqual({
			user: adminUser,
			isAdmin: true
		});
	});

	it('should return user and isAdmin=false when non-admin accesses admin route', async () => {
		const regularUser = {
			id: 'user-1',
			email: 'user@test.com',
			name: 'User',
			role: 'user',
			banned: false,
			banReason: null
		};

		const event = {
			locals: { user: regularUser }
		} as any;

		const result = await load(event);

		expect(result).toEqual({
			user: regularUser,
			isAdmin: false
		});
	});

	it('should return user and isAdmin=false when viewer accesses admin route', async () => {
		const viewerUser = {
			id: 'viewer-1',
			email: 'viewer@test.com',
			name: 'Viewer',
			role: 'viewer',
			banned: false,
			banReason: null
		};

		const event = {
			locals: { user: viewerUser }
		} as any;

		const result = await load(event);

		expect(result).toEqual({
			user: viewerUser,
			isAdmin: false
		});
	});

	it('should handle unauthenticated user', async () => {
		const event = {
			locals: { user: null }
		} as any;

		const result = await load(event);

		expect(result).toEqual({
			user: null,
			isAdmin: false
		});
	});
});
