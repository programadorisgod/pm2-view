import { error } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createAuditService } from '$lib/services/admin/audit.service';
import { listAuditQuerySchema } from '$lib/validation/audit-schemas';

const auditService = createAuditService();

export const GET = adminHandler(async ({ url }) => {
	const parseResult = listAuditQuerySchema.safeParse({
		action: url.searchParams.get('action'),
		actorId: url.searchParams.get('actorId'),
		targetId: url.searchParams.get('targetId'),
		resourceType: url.searchParams.get('resourceType'),
		startDate: url.searchParams.get('startDate'),
		endDate: url.searchParams.get('endDate')
	});

	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	const { page: _page, limit: _limit, ...filters } = parseResult.data;

	// Convert date strings to Date objects if present
	const auditFilters: Record<string, any> = { ...filters };
	if (auditFilters.startDate) {
		auditFilters.startDate = new Date(auditFilters.startDate);
	}
	if (auditFilters.endDate) {
		auditFilters.endDate = new Date(auditFilters.endDate);
	}

	const csvString = await auditService.exportCSV(auditFilters);

	return new Response(csvString, {
		headers: {
			'Content-Type': 'text/csv',
			'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`
		}
	});
});
