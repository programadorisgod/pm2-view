import { db } from '$lib/db';
import { auditLogs } from '$lib/db/schema';
import type { NewAuditLog } from '$lib/db/schema';

/**
 * Logs an audit event to the audit_logs table.
 * This function is append-only - audit logs should never be updated or deleted.
 *
 * @param entry - The audit entry object with action, actorId, and optional fields
 * @param entry.action - The action performed (e.g., 'role_change', 'project_member_add', 'team_create', 'user_ban')
 * @param entry.actorId - The ID of the user who performed the action
 * @param entry.targetId - Optional ID of the user/resource that was affected
 * @param entry.resourceType - Optional type of resource ('user', 'project', 'team', 'audit_log')
 * @param entry.resourceId - Optional ID of the specific resource
 * @param entry.details - Optional additional details (will be JSON-stringified)
 */
export async function logAudit(
	actionOrEntry: string | {
		action: string;
		actorId: string;
		targetId?: string;
		resourceType?: string;
		resourceId?: string;
		details?: Record<string, unknown>;
	},
	actorId?: string,
	targetId?: string,
	resourceType?: string,
	resourceId?: string,
	details?: Record<string, unknown>
): Promise<void> {
	// Support both old positional API and new object-based API
	let entry: {
		action: string;
		actorId: string;
		targetId?: string;
		resourceType?: string;
		resourceId?: string;
		details?: Record<string, unknown>;
	};

	if (typeof actionOrEntry === 'string') {
		// Old API — backward compatibility
		entry = {
			action: actionOrEntry,
			actorId: actorId!,
			targetId,
			resourceType,
			resourceId,
			details
		};
	} else {
		// New object-based API
		entry = actionOrEntry;
	}

	const auditEntry: NewAuditLog = {
		id: crypto.randomUUID(),
		action: entry.action,
		actorId: entry.actorId,
		targetId: entry.targetId ?? null,
		resourceType: entry.resourceType ?? null,
		resourceId: entry.resourceId ?? null,
		details: entry.details ? JSON.stringify(entry.details) : null
	};

	await db.insert(auditLogs).values(auditEntry);
}
