import { z } from 'zod';

/**
 * Schema for listing audit logs with filters and pagination
 */
export const listAuditQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	action: z.string().optional(),
	actorId: z.string().optional(),
	targetId: z.string().optional(),
	resourceType: z.string().optional(),
	startDate: z.string().optional(),
	endDate: z.string().optional()
});

// Type exports
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
