import { z } from 'zod';

/**
 * Schema for adding a member to a project
 */
export const addProjectMemberSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	role: z.enum(['owner', 'editor', 'viewer'])
});

/**
 * Schema for updating a project member's role
 */
export const updateProjectMemberSchema = z.object({
	role: z.enum(['owner', 'editor', 'viewer'])
});

/**
 * Schema for listing project members with pagination
 */
export const listProjectMembersQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20)
});

// Type exports
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;
export type UpdateProjectMemberInput = z.infer<typeof updateProjectMemberSchema>;
export type ListProjectMembersQuery = z.infer<typeof listProjectMembersQuerySchema>;
