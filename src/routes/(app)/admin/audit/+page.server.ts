import { requireAdmin } from '$lib/server/route-guards';
import { createAuditService } from '$lib/services/admin/audit.service';
import type { AuditLogFilters } from '$lib/db/repositories/audit-log-repository.interface';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	requireAdmin(locals.user);

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '20', 10);

	const actionFilter = url.searchParams.get('action') || undefined;
	const actorIdFilter = url.searchParams.get('actorId') || undefined;
	const startDate = url.searchParams.get('startDate') || undefined;
	const endDate = url.searchParams.get('endDate') || undefined;

	const filters: AuditLogFilters | undefined = (actionFilter || actorIdFilter || startDate || endDate)
		? {
			action: actionFilter,
			actorId: actorIdFilter,
			startDate: startDate ? new Date(startDate) : undefined,
			endDate: endDate ? new Date(endDate) : undefined
		}
		: undefined;

	try {
		const auditService = createAuditService();
		const result = await auditService.listLogs({ page, limit, filters });

		return {
			logs: result.logs,
			pagination: result.pagination
		};
	} catch (e) {
		console.error('Failed to load audit logs:', e);
		throw error(500, 'Failed to retrieve audit logs');
	}
};
