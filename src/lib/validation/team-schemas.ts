import { z } from 'zod';

/**
 * Schema for creating a new team
 */
export const createTeamSchema = z.object({
	name: z.string().min(1, 'Team name is required').max(100, 'Team name must be at most 100 characters'),
	description: z.string().optional()
});

/**
 * Schema for updating an existing team
 */
export const updateTeamSchema = z.object({
	name: z.string().min(1, 'Team name is required').max(100, 'Team name must be at most 100 characters').optional(),
	description: z.string().optional()
});

/**
 * Schema for adding a member to a team
 */
export const addTeamMemberSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	role: z.enum(['team_owner', 'team_admin', 'team_member']).default('team_member')
});

/**
 * Schema for updating a team member's role
 */
export const updateTeamMemberSchema = z.object({
	role: z.enum(['team_owner', 'team_admin', 'team_member'])
});

/**
 * Schema for listing teams with pagination
 */
export const listTeamsQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20)
});

// Type exports
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
export type ListTeamsQuery = z.infer<typeof listTeamsQuerySchema>;
