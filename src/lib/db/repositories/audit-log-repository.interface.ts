import type { AuditLog } from '../schema/audit-logs';

/**
 * Filters for querying audit logs
 */
export type AuditLogFilters = {
  action?: string;
  actorId?: string;
  targetId?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
};

/**
 * Audit log entry with actor information for list views
 */
export type AuditLogWithActor = AuditLog & {
  actor: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

/**
 * Interface for Audit Log repository operations
 * Provides append-only audit trail functionality
 */
export interface IAuditLogRepository {
  /**
   * Create a new audit log entry
   * Audit logs are append-only (no update/delete)
   * @param entry - The audit log data
   */
  create(entry: {
    action: string;
    actorId: string;
    targetId?: string;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, unknown>;
  }): Promise<void>;

  /**
   * Find all audit logs with filters and pagination
   * @param options - Filters and pagination options
   * @returns Audit logs with actor info and total count
   */
  findAll(options: {
    filters?: AuditLogFilters;
    limit: number;
    offset: number;
  }): Promise<{ logs: AuditLogWithActor[]; total: number }>;

  /**
   * Count audit logs with optional filters
   * @param filters - Optional filters to apply
   * @returns The count of matching audit logs
   */
  count(filters?: AuditLogFilters): Promise<number>;
}
