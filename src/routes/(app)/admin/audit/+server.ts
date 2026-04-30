import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/route-guards';
import { db } from '$lib/db';
import { auditLogs, users } from '$lib/db/schema';
import { eq, like, and, gte, lte, desc, sql } from 'drizzle-orm';

// Temporary type cast to work around db proxy typing issue
const drizzleDb = db as any;

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Check admin access
	requireAdmin(user);

	// Parse pagination parameters
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '20', 10);
	const offset = (page - 1) * limit;

	// Parse filters
	const actionFilter = url.searchParams.get('action');
	const actorIdFilter = url.searchParams.get('actorId');
	const targetIdFilter = url.searchParams.get('targetId');
	const resourceTypeFilter = url.searchParams.get('resourceType');
	const startDate = url.searchParams.get('startDate');
	const endDate = url.searchParams.get('endDate');

	try {
		// Build where conditions
		const conditions = [];

		if (actionFilter) {
			conditions.push(eq(auditLogs.action, actionFilter));
		}

		if (actorIdFilter) {
			conditions.push(eq(auditLogs.actorId, actorIdFilter));
		}

		if (targetIdFilter) {
			conditions.push(eq(auditLogs.targetId, targetIdFilter));
		}

		if (resourceTypeFilter) {
			conditions.push(eq(auditLogs.resourceType, resourceTypeFilter));
		}

		if (startDate) {
			conditions.push(gte(auditLogs.timestamp, new Date(startDate)));
		}

		if (endDate) {
			conditions.push(lte(auditLogs.timestamp, new Date(endDate)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		// Get audit logs with actor information
		const logs = await drizzleDb.query.auditLogs.findMany({
			where: whereClause,
			limit,
			offset,
			orderBy: [desc(auditLogs.timestamp)],
			with: {
				actor: {
					columns: { id: true, email: true, name: true }
				}
			}
		});

		// Get total count for pagination
		const totalResult = await drizzleDb.select({ count: sql<number>`count(*)` })
			.from(auditLogs)
			.where(whereClause || sql`1=1`);

		const total = totalResult[0]?.count || 0;

		// Format response
		const formattedLogs = logs.map((log: any) => ({
			id: log.id,
			action: log.action,
			actor: log.actor,
			targetId: log.targetId,
			resourceType: log.resourceType,
			resourceId: log.resourceId,
			details: log.details ? JSON.parse(log.details) : null,
			timestamp: log.timestamp
		}));

		return json({
			logs: formattedLogs,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit)
			}
		});
	} catch (e) {
		console.error('Failed to query audit logs:', e);
		throw error(500, 'Failed to retrieve audit logs');
	}
};
