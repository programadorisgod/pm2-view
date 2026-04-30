import { error } from '@sveltejs/kit';
import type { IAuditLogRepository, AuditLogFilters, AuditLogWithActor } from '$lib/db/repositories/audit-log-repository.interface';
import { AuditLogRepository } from '$lib/db/repositories/audit-log-repository.impl';

export interface AuditListResult {
  logs: AuditLogWithActor[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class AuditService {
  constructor(private auditRepo: IAuditLogRepository) {}

  async listLogs(options: {
    page?: number;
    limit?: number;
    filters?: AuditLogFilters;
  }): Promise<AuditListResult> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const offset = (page -1) * limit;

    const result = await this.auditRepo.findAll({
      filters: options.filters,
      limit,
      offset
    });

    const totalPages = Math.ceil(result.total / limit);

    return {
      logs: result.logs,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages
      }
    };
  }

  async exportCSV(filters?: AuditLogFilters): Promise<string> {
    // Fetch ALL logs (no pagination) - use large limit
    const result = await this.auditRepo.findAll({
      filters,
      limit: 10000,
      offset: 0
    });

    const logs = result.logs;

    // CSV headers
    const headers = [
      'id',
      'action',
      'actorEmail',
      'actorName',
      'targetId',
      'resourceType',
      'resourceId',
      'details',
      'timestamp'
    ];

    // Build CSV rows
    const rows = logs.map((log) => [
      this.escapeCsvField(log.id),
      this.escapeCsvField(log.action),
      this.escapeCsvField(log.actor?.email ?? ''),
      this.escapeCsvField(log.actor?.name ?? ''),
      this.escapeCsvField(log.targetId ?? ''),
      this.escapeCsvField(log.resourceType ?? ''),
      this.escapeCsvField(log.resourceId ?? ''),
      this.escapeCsvField(log.details ?? ''),
      this.escapeCsvField(log.timestamp instanceof Date ? log.timestamp.toISOString() : String(log.timestamp))
    ]);

    // Combine headers and rows
    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ];

    return csvLines.join('\n');
  }

  private escapeCsvField(value: string): string {
    // If the value contains comma, quote, or newline, wrap in quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      // Escape quotes by doubling them
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }
}

/**
 * Factory function to create AuditService with default repository
 */
export function createAuditService(): AuditService {
  return new AuditService(new AuditLogRepository());
}
