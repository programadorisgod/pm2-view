import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockProjectRepo, mockTeamRepo, mockAuditRepo } = vi.hoisted(() => ({
  mockProjectRepo: {
    getById: vi.fn(),
    update: vi.fn()
  },
  mockTeamRepo: {
    findById: vi.fn(),
    findAll: vi.fn()
  },
  mockAuditRepo: {
    create: vi.fn()
  }
}));

vi.mock('$lib/db/repositories/project-repository.impl', () => ({
  ProjectRepository: vi.fn(() => mockProjectRepo)
}));

vi.mock('$lib/db/repositories/team-repository.impl', () => ({
  TeamRepository: vi.fn(() => mockTeamRepo)
}));

vi.mock('$lib/db/repositories/audit-log-repository.impl', () => ({
  AuditLogRepository: vi.fn(() => mockAuditRepo)
}));

vi.mock('$lib/db/repositories/project-member-repository.impl', () => ({
  ProjectMemberRepository: vi.fn(() => ({ findByProject: vi.fn(), findMember: vi.fn(), add: vi.fn(), remove: vi.fn(), updateRole: vi.fn() }))
}));

vi.mock('@sveltejs/kit', () => ({
  error: vi.fn((status: number, message: string) => {
    const err = new Error(message) as Error & { status: number };
    err.status = status;
    throw err;
  })
}));

import { ProjectSharingService } from '$lib/services/admin/project-sharing.service';

describe('ProjectSharingService.assignToTeam', () => {
  let service: ProjectSharingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProjectSharingService(
      {} as any,
      mockAuditRepo,
      mockProjectRepo,
      mockTeamRepo
    );
  });

  it('should assign project to team', async () => {
    mockProjectRepo.getById.mockResolvedValue({ id: 'p1', name: 'Test', teamId: null });
    mockTeamRepo.findById.mockResolvedValue({ id: 't1', name: 'Team Alpha' });
    mockProjectRepo.update.mockResolvedValue({ id: 'p1', teamId: 't1' });

    await service.assignToTeam('p1', 't1', 'admin-1');

    expect(mockProjectRepo.update).toHaveBeenCalledWith('p1', { teamId: 't1' });
    expect(mockAuditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project_team_assign',
        actorId: 'admin-1',
        details: expect.objectContaining({ from: null, to: 't1' })
      })
    );
  });

  it('should unassign project from team', async () => {
    mockProjectRepo.getById.mockResolvedValue({ id: 'p1', name: 'Test', teamId: 't1' });
    mockProjectRepo.update.mockResolvedValue({ id: 'p1', teamId: null });

    await service.assignToTeam('p1', null, 'admin-1');

    expect(mockProjectRepo.update).toHaveBeenCalledWith('p1', { teamId: null });
    expect(mockAuditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project_team_assign',
        details: expect.objectContaining({ from: 't1', to: null })
      })
    );
  });

  it('should throw 404 when project not found', async () => {
    mockProjectRepo.getById.mockResolvedValue(null);

    await expect(service.assignToTeam('nonexistent', 't1', 'admin-1')).rejects.toThrow();
  });

  it('should throw 404 when team not found', async () => {
    mockProjectRepo.getById.mockResolvedValue({ id: 'p1', name: 'Test', teamId: null });
    mockTeamRepo.findById.mockResolvedValue(null);

    await expect(service.assignToTeam('p1', 'nonexistent', 'admin-1')).rejects.toThrow();
  });
});

describe('ProjectSharingService.getAllTeams', () => {
  let service: ProjectSharingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProjectSharingService(
      {} as any,
      mockAuditRepo,
      mockProjectRepo,
      mockTeamRepo
    );
  });

  it('should return all teams', async () => {
    mockTeamRepo.findAll.mockResolvedValue({
      teams: [{ id: 't1', name: 'Team Alpha' }, { id: 't2', name: 'Team Beta' }],
      total: 2
    });

    const result = await service.getAllTeams();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Team Alpha');
  });
});
