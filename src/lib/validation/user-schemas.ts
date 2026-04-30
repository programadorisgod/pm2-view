import { z } from 'zod';

/**
 * Schema for creating a new user (admin operation)
 */
export const createUserSchema = z.object({
	email: z.email(),
	password: z.string().min(8, 'Password must be at least 8 characters'),
	name: z.string().min(1, 'Name is required'),
	role: z.enum(['admin', 'user', 'viewer']).default('user')
});

/**
 * Schema for updating an existing user (admin operation)
 */
export const updateUserSchema = z.object({
	role: z.enum(['admin', 'user', 'viewer']).optional(),
	banned: z.boolean().optional(),
	banReason: z.string().optional(),
	banExpires: z.coerce.date().optional()
});

/**
 * Schema for listing users with pagination and filters
 */
export const listUsersQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	role: z.enum(['admin', 'user', 'viewer']).optional()
});

// Type exports
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
