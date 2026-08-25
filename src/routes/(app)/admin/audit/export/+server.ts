import { error } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createAuditService } from '$lib/services/admin/audit.service';

const auditService = createAuditService();

export const GET = adminHandler(async ({ url }) => {
	const action = url.searchParams.get('action') || undefined;
	const actorQuery = url.searchParams.get('actor') || undefined;
	const startDate = url.searchParams.get('startDate') || undefined;
	const endDate = url.searchParams.get('endDate') || undefined;

	const filters: Record<string, any> = {};
	if (action) filters.action = action;
	if (actorQuery) filters.actorQuery = actorQuery;
	if (startDate) filters.startDate = new Date(startDate);
	if (endDate) filters.endDate = new Date(endDate);

	const csvString = await auditService.exportCSV(Object.keys(filters).length > 0 ? filters : undefined);

	return new Response(csvString, {
		headers: {
			'Content-Type': 'text/csv',
			'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`
		}
	});
});
