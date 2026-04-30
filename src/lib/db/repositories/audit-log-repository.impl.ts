import { db } from '../db';
import { auditLogs } from '../schema';
import { eq, like, gte, lte, and, desc, count } from 'drizzle-orm';
import type { IAuditLogRepository, AuditLogFilters, AuditLogWithActor } from './audit-log-repository.interface';

/**
 * Drizzle ORM implementation of IAuditLogRepository
 * Provides append-only audit trail functionality
 */
export class AuditLogRepository implements IAuditLogRepository {
	async create(entry: {
		action: string;
		actorId: string;
		targetId?: string;
		resourceType?: string;
		resourceId?: string;
		details?: Record<string, unknown>;
	}): Promise<void> {
		await db.insert(auditLogs).values({
			id: crypto.randomUUID(),
			action: entry.action,
			actorId: entry.actorId,
			targetId: entry.targetId ?? null,
			resourceType: entry.resourceType ?? null,
			resourceId: entry.resourceId ?? null,
			details: entry.details ? JSON.stringify(entry.details) : null
		});
	}

	async findAll(options: {
		filters?: AuditLogFilters;
		limit: number;
		offset: number;
	}): Promise<{ logs: AuditLogWithActor[]; total: number }> {
		// Build where conditions from filters
		const conditions = this.buildWhereConditions(options.filters);

		// Get logs with actor info
		const logs = await db.query.auditLogs.findMany({
			where: conditions.length > 0 ? and(...conditions) : undefined,
			limit: options.limit,
			offset: options.offset,
			orderBy: desc(auditLogs.timestamp),
			with: {
				actor: {
					columns: {
						id: true,
						name: true,
						email: true
					}
				}
			}
		});

		// Get total count with same filters
		const [{ count: total }] = await db
			.select({ count: count() })
			.from(auditLogs)
			.where(conditions.length > 0 ? and(...conditions) : undefined);

		return {
			logs: logs as AuditLogWithActor[],
			total: Number(total)
		};
	}

	async count(filters?: AuditLogFilters): Promise<number> {
		const conditions = this.buildWhereConditions(filters);

		const [{ count: total }] = await db
			.select({ count: count() })
			.from(auditLogs)
			.where(conditions.length > 0 ? and(...conditions) : undefined);

		return Number(total);
	}

	private buildWhereConditions(filters?: AuditLogFilters) {
		const conditions = [];

		if (filters?.action) {
			conditions.push(eq(auditLogs.action, filters.action));
		}

		if (filters?.actorId) {
			conditions.push(eq(auditLogs.actorId, filters.actorId));
		}

		if (filters?.targetId) {
			conditions.push(eq(auditLogs.targetId, filters.targetId));
		}

		if (filters?.resourceType) {
			conditions.push(eq(auditLogs.resourceType, filters.resourceType));
		}

		if (filters?.startDate) {
			conditions.push(gte(auditLogs.timestamp, filters.startDate));
		}

		if (filters?.endDate) {
			conditions.push(lte(auditLogs.timestamp, filters.endDate));
		}

		return conditions;
	}
}

/**
 * Factory function to create AuditLogRepository
 * Uses default db import
 */
export function createAuditLogRepository(): AuditLogRepository {
	return new AuditLogRepository();
}
