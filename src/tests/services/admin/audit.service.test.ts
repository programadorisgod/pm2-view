import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService } from '$lib/services/admin/audit.service';
import type { IAuditLogRepository, AuditLogWithActor, AuditLogFilters } from '$lib/db/repositories/audit-log-repository.interface';

// Mock audit log data
const mockLog1: AuditLogWithActor = {
  id: 'log-1',
  action: 'user_create',
  actorId: 'admin-1',
  targetId: 'user-1',
  resourceType: 'user',
  resourceId: 'user-1',
  details: JSON.stringify({ email: 'test@test.com' }),
  timestamp: new Date('2024-01-01'),
  actor: {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@test.com'
  }
};

const mockLog2: AuditLogWithActor = {
  id: 'log-2',
  action: 'user_role_change',
  actorId: 'admin-1',
  targetId: 'user-2',
  resourceType: 'user',
  resourceId: 'user-2',
  details: JSON.stringify({ newRole: 'admin' }),
  timestamp: new Date('2024-01-02'),
  actor: {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@test.com'
  }
};

describe('AuditService', () => {
  let auditRepo: any;
  let auditService: AuditService;

  beforeEach(() => {
    auditRepo = {
      create: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn()
    };

    auditService = new AuditService(auditRepo);
  });

  describe('listLogs', () => {
    it('should return paginated results', async () => {
      auditRepo.findAll.mockResolvedValue({
        logs: [mockLog1, mockLog2],
        total: 2
      });

      const result = await auditService.listLogs({
        page: 1,
        limit: 20
      });

      expect(result.logs).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1
      });
      expect(auditRepo.findAll).toHaveBeenCalledWith({
        filters: undefined,
        limit: 20,
        offset: 0
      });
    });

    it('should apply filters correctly', async () => {
      auditRepo.findAll.mockResolvedValue({
        logs: [mockLog1],
        total: 1
      });

      const filters: AuditLogFilters = {
        action: 'user_create',
        actorId: 'admin-1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };

      await auditService.listLogs({
        page: 1,
        limit: 20,
        filters
      });

      expect(auditRepo.findAll).toHaveBeenCalledWith({
        filters,
        limit: 20,
        offset: 0
      });
    });

    it('should handle empty results', async () => {
      auditRepo.findAll.mockResolvedValue({
        logs: [],
        total: 0
      });

      const result = await auditService.listLogs({
        page: 1,
        limit: 20
      });

      expect(result.logs).toHaveLength(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it('should calculate totalPages correctly', async () => {
      auditRepo.findAll.mockResolvedValue({
        logs: new Array(20).fill(mockLog1),
        total: 45
      });

      const result = await auditService.listLogs({
        page: 2,
        limit: 20
      });

      expect(result.pagination.total).toBe(45);
      expect(result.pagination.totalPages).toBe(3); // 45/20 = 2.25 -> 3 pages
    });
  });

  describe('exportCSV', () => {
    it('should return valid CSV string with headers', async () => {
      auditRepo.findAll.mockResolvedValue({
        logs: [mockLog1, mockLog2],
        total: 2
      });

      const csv = await auditService.exportCSV();

      // Check CSV has headers
      expect(csv).toContain('id,action,actorEmail,actorName,targetId,resourceType,resourceId,details,timestamp');

      // Check data rows exist
      expect(csv).toContain('user_create');
      expect(csv).toContain('user_role_change');
      expect(csv).toContain('admin@test.com');
    });

    it('should handle empty results', async () => {
      auditRepo.findAll.mockResolvedValue({
        logs: [],
        total: 0
      });

      const csv = await auditService.exportCSV();

      // Should still have headers
      expect(csv).toContain('id,action,actorEmail,actorName,targetId,resourceType,resourceId,details,timestamp');

      // Should only have header line (no data rows)
      const lines = csv.split('\n').filter(line => line.trim());
      expect(lines).toHaveLength(1); // Only header
    });

    it('should escape CSV fields containing commas', async () => {
      const logWithComma: AuditLogWithActor = {
        ...mockLog1,
        details: JSON.stringify({ note: 'has, comma' })
      };

      auditRepo.findAll.mockResolvedValue({
        logs: [logWithComma],
        total: 1
      });

      const csv = await auditService.exportCSV();

      expect(csv).toContain('"has, comma"');
    });

    it('should use filters when provided', async () => {
      auditRepo.findAll.mockResolvedValue({
        logs: [mockLog1],
        total: 1
      });

      const filters: AuditLogFilters = {
        action: 'user_create',
        resourceType: 'user'
      };

      await auditService.exportCSV(filters);

      expect(auditRepo.findAll).toHaveBeenCalledWith({
        filters,
        limit: 10000,
        offset: 0
      });
    });

    it('should handle null actor gracefully', async () => {
      const logWithNullActor: AuditLogWithActor = {
        ...mockLog1,
        actor: null
      };

      auditRepo.findAll.mockResolvedValue({
        logs: [logWithNullActor],
        total: 1
      });

      const csv = await auditService.exportCSV();

      // Should handle null actor by using empty strings
      expect(csv).toContain('user_create');
    });
  });
});
