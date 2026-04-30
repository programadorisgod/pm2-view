import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Test the validation schemas used by admin user endpoints
const createUserSchema = z.object({
	email: z.string().email('Invalid email address'),
	password: z.string().min(8, 'Password must be at least 8 characters'),
	name: z.string().min(1, 'Name is required'),
	role: z.enum(['admin', 'user', 'viewer']).default('user')
});

const updateUserSchema = z.object({
	role: z.enum(['admin', 'user', 'viewer']).optional(),
	banned: z.boolean().optional(),
	banReason: z.string().optional()
});

describe('Admin Users API - Validation', () => {
	describe('createUserSchema', () => {
		it('should validate a valid user creation request', () => {
			const result = createUserSchema.safeParse({
				email: 'test@example.com',
				password: 'password123',
				name: 'Test User'
			});
			expect(result.success).toBe(true);
		});

		it('should reject invalid email', () => {
			const result = createUserSchema.safeParse({
				email: 'invalid-email',
				password: 'password123',
				name: 'Test User'
			});
			expect(result.success).toBe(false);
		});

		it('should reject short password', () => {
			const result = createUserSchema.safeParse({
				email: 'test@example.com',
				password: 'short',
				name: 'Test User'
			});
			expect(result.success).toBe(false);
		});

		it('should reject empty name', () => {
			const result = createUserSchema.safeParse({
				email: 'test@example.com',
				password: 'password123',
				name: ''
			});
			expect(result.success).toBe(false);
		});

		it('should default role to user', () => {
			const result = createUserSchema.safeParse({
				email: 'test@example.com',
				password: 'password123',
				name: 'Test User'
			});
			if (result.success) {
				expect(result.data.role).toBe('user');
			}
		});

		it('should accept valid role', () => {
			const result = createUserSchema.safeParse({
				email: 'test@example.com',
				password: 'password123',
				name: 'Test User',
				role: 'admin'
			});
			expect(result.success).toBe(true);
		});

		it('should reject invalid role', () => {
			const result = createUserSchema.safeParse({
				email: 'test@example.com',
				password: 'password123',
				name: 'Test User',
				role: 'superadmin'
			});
			expect(result.success).toBe(false);
		});
	});

	describe('updateUserSchema', () => {
		it('should allow partial updates', () => {
			const result = updateUserSchema.safeParse({ role: 'admin' });
			expect(result.success).toBe(true);
		});

		it('should allow ban without reason', () => {
			const result = updateUserSchema.safeParse({ banned: true });
			expect(result.success).toBe(true);
		});

		it('should reject invalid role', () => {
			const result = updateUserSchema.safeParse({ role: 'invalid' });
			expect(result.success).toBe(false);
		});
	});
});

describe('Admin Users API - Auth mock integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should require admin role for user listing', async () => {
		const { requireAdmin } = await import('$lib/server/route-guards');
		
		// Admin should pass
		expect(() => requireAdmin({ id: '1', role: 'admin' } as any)).not.toThrow();
	});

	it('should reject non-admin for user listing', async () => {
		const { requireAdmin } = await import('$lib/server/route-guards');
		
		expect(() => requireAdmin({ id: '1', role: 'user' } as any)).toThrow();
	});
});
