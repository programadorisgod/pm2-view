import { db } from '$lib/db';
import { auditLogs } from '$lib/db/schema';
import type { NewAuditLog } from '$lib/db/schema';

/**
 * Logs an audit event to the audit_logs table.
 * This function is append-only - audit logs should never be updated or deleted.
 *
 * @param action - The action performed (e.g., 'role_change', 'project_member_add', 'team_create', 'user_ban')
 * @param actorId - The ID of the user who performed the action
 * @param targetId - Optional ID of the user/resource that was affected
 * @param resourceType - Optional type of resource ('user', 'project', 'team', 'audit_log')
 * @param resourceId - Optional ID of the specific resource
 * @param details - Optional additional details (will be JSON-stringified)
 */
export async function logAudit(
	action: string,
	actorId: string,
	targetId?: string,
	resourceType?: string,
	resourceId?: string,
	details?: Record<string, unknown>
): Promise<void> {
	const auditEntry: NewAuditLog = {
		id: crypto.randomUUID(),
		action,
		actorId,
		targetId: targetId ?? null,
		resourceType: resourceType ?? null,
		resourceId: resourceId ?? null,
		details: details ? JSON.stringify(details) : null
	};

	await db.insert(auditLogs).values(auditEntry);
}
