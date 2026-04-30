import { requireAdmin } from '$lib/server/route-guards';
import { db } from '$lib/db';
import { auditLogs } from '$lib/db/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const drizzleDb = db as any;

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	requireAdmin(locals.user);

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '20', 10);
	const offset = (page - 1) * limit;

	const actionFilter = url.searchParams.get('action');
	const actorIdFilter = url.searchParams.get('actorId');
	const startDate = url.searchParams.get('startDate');
	const endDate = url.searchParams.get('endDate');

	try {
		const conditions = [];
		if (actionFilter) conditions.push(eq(auditLogs.action, actionFilter));
		if (actorIdFilter) conditions.push(eq(auditLogs.actorId, actorIdFilter));
		if (startDate) conditions.push(gte(auditLogs.timestamp, new Date(startDate)));
		if (endDate) conditions.push(lte(auditLogs.timestamp, new Date(endDate)));

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const logs = await drizzleDb.query.auditLogs.findMany({
			where: whereClause,
			limit,
			offset,
			orderBy: [desc(auditLogs.timestamp)],
			with: { actor: { columns: { id: true, email: true, name: true } } }
		});

		const totalResult = await drizzleDb.select({ count: sql<number>`count(*)` })
			.from(auditLogs)
			.where(whereClause || sql`1=1`);

		const total = totalResult[0]?.count || 0;

		return {
			logs: logs.map((log: any) => ({
				id: log.id,
				action: log.action,
				actor: log.actor,
				targetId: log.targetId,
				resourceType: log.resourceType,
				resourceId: log.resourceId,
				details: log.details ? JSON.parse(log.details) : null,
				timestamp: log.timestamp
			})),
			pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
		};
	} catch (e) {
		console.error('Failed to load audit logs:', e);
		throw error(500, 'Failed to retrieve audit logs');
	}
};
