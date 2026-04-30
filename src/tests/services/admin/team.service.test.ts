import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamService } from '$lib/services/admin/team.service';
import type { ITeamRepository, Team, TeamMember } from '$lib/db/repositories/team-repository.interface';
import type { IAuditLogRepository } from '$lib/db/repositories/audit-log-repository.interface';

// Mock @sveltejs/kit error function
vi.mock('@sveltejs/kit', () => ({
  error: vi.fn((status: number, message: string) => {
    const err = new Error(message) as Error & { status: number };
    err.status = status;
    throw err;
  }),
  json: vi.fn((data: any) => new Response(JSON.stringify(data)))
}));

const mockTeam: Team = {
  id: 'team-1',
  name: 'Engineering',
  description: 'Engineering team',
  createdAt: new Date('2024-01-01')
};

const mockMember: TeamMember = {
  id: 'member-1',
  teamId: 'team-1',
  userId: 'user-1',
  role: 'team_owner',
  joinedAt: new Date('2024-01-01')
};

describe('TeamService', () => {
  let teamRepo: any;
  let auditRepo: any;
  let teamService: TeamService;

  beforeEach(() => {
    vi.clearAllMocks();
    
    teamRepo = {
      findById: vi.fn(),
      findAll: vi.fn().mockResolvedValue({ teams: [], total: 0 }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addMember: vi.fn(),
      removeMember: vi.fn(),
      updateMemberRole: vi.fn(),
      countOwners: vi.fn(),
      findMember: vi.fn()
    };

    auditRepo = {
      create: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn()
    };

    teamService = new TeamService(teamRepo, auditRepo);
  });

  describe('listTeams', () => {
    it('should return paginated results with member counts', async () => {
      teamRepo.findAll.mockResolvedValue({
        teams: [
          { ...mockTeam, memberCount: 2 },
          { ...mockTeam, id: 'team-2', name: 'Design', memberCount: 0 }
        ],
        total: 2
      });

      const result = await teamService.listTeams({ page: 1, limit: 20 });

      expect(result.teams).toHaveLength(2);
      expect(result.teams[0].memberCount).toBe(2);
    });
  });

  describe('createTeam', () => {
    it('should create team with auto-owner and log audit', async () => {
      const newTeam = { ...mockTeam, id: 'new-team' };
      teamRepo.findAll.mockResolvedValue({ teams: [], total: 0 });
      teamRepo.create.mockResolvedValue(newTeam);

      await teamService.createTeam({
        name: 'New Team',
        description: 'A new team'
      }, 'admin-1');

      expect(teamRepo.create).toHaveBeenCalledWith({
        name: 'New Team',
        description: 'A new team',
        ownerId: 'admin-1'
      });
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'team_create' })
      );
    });

    it('should prevent duplicate team names (throw 409)', async () => {
      teamRepo.findAll.mockResolvedValue({
        teams: [mockTeam],
        total: 1
      });

      await expect(
        teamService.createTeam({ name: 'Engineering' }, 'admin-1')
      ).rejects.toThrow('already exists');
    });
  });

  describe('getTeam', () => {
    it('should return team by id', async () => {
      teamRepo.findById.mockResolvedValue(mockTeam);

      const result = await teamService.getTeam('team-1');

      expect(result).toEqual(mockTeam);
    });

    it('should return null for non-existent team', async () => {
      teamRepo.findById.mockResolvedValue(null);

      const result = await teamService.getTeam('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateTeam', () => {
    it('should update team and log audit', async () => {
      teamRepo.findById.mockResolvedValue(mockTeam);
      teamRepo.findAll.mockResolvedValue({ teams: [mockTeam], total: 1 });
      const updatedTeam = { ...mockTeam, name: 'Updated Name' };
      teamRepo.update.mockResolvedValue(updatedTeam);

      await teamService.updateTeam('team-1', { name: 'Updated Name' }, 'admin-1');

      expect(teamRepo.update).toHaveBeenCalledWith('team-1', { name: 'Updated Name' });
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'team_update' })
      );
    });

    it('should throw 404 for non-existent team', async () => {
      teamRepo.findById.mockResolvedValue(null);

      await expect(
        teamService.updateTeam('non-existent', { name: 'New' }, 'admin-1')
      ).rejects.toThrow('Team not found');
    });
  });

  describe('deleteTeam', () => {
    it('should delete team and log audit', async () => {
      teamRepo.findById.mockResolvedValue(mockTeam);

      await teamService.deleteTeam('team-1', 'admin-1');

      expect(teamRepo.delete).toHaveBeenCalledWith('team-1');
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'team_delete' })
      );
    });

    it('should throw 404 for non-existent team', async () => {
      teamRepo.findById.mockResolvedValue(null);

      await expect(
        teamService.deleteTeam('non-existent', 'admin-1')
      ).rejects.toThrow('Team not found');
    });
  });

  describe('addMember', () => {
    it('should add member and log audit', async () => {
      teamRepo.findById.mockResolvedValue(mockTeam);
      teamRepo.findMember.mockResolvedValue(null);
      const newMember = { ...mockMember, userId: 'user-2' };
      teamRepo.addMember.mockResolvedValue(newMember);

      await teamService.addMember('team-1', 'user-2', 'team_member', 'admin-1');

      expect(teamRepo.addMember).toHaveBeenCalledWith('team-1', 'user-2', 'team_member');
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'team_member_add' })
      );
    });

    it('should prevent duplicate members (throw 409)', async () => {
      teamRepo.findById.mockResolvedValue(mockTeam);
      teamRepo.findMember.mockResolvedValue(mockMember);

      await expect(
        teamService.addMember('team-1', 'user-1', 'team_member', 'admin-1')
      ).rejects.toThrow('already a member');
    });
  });

  describe('removeMember', () => {
    it('should prevent removing last owner (throw 409)', async () => {
      teamRepo.findMember.mockResolvedValue({ ...mockMember, role: 'team_owner' });
      teamRepo.countOwners.mockResolvedValue(1);

      await expect(
        teamService.removeMember('team-1', 'user-1', 'admin-1')
      ).rejects.toThrow('last owner');
    });

    it('should allow removing non-owner member', async () => {
      teamRepo.findMember.mockResolvedValue({ ...mockMember, role: 'team_member' });

      await teamService.removeMember('team-1', 'user-1', 'admin-1');

      expect(teamRepo.removeMember).toHaveBeenCalledWith('team-1', 'user-1');
    });
  });

  describe('updateMemberRole', () => {
    it('should prevent demoting last owner (throw 409)', async () => {
      teamRepo.findMember.mockResolvedValue({ ...mockMember, role: 'team_owner' });
      teamRepo.countOwners.mockResolvedValue(1);

      await expect(
        teamService.updateMemberRole('team-1', 'user-1', 'team_member', 'admin-1')
      ).rejects.toThrow('last owner');
    });

    it('should allow role change for non-owners', async () => {
      teamRepo.findMember.mockResolvedValue({ ...mockMember, role: 'team_member' });

      await teamService.updateMemberRole('team-1', 'user-1', 'team_admin', 'admin-1');

      expect(teamRepo.updateMemberRole).toHaveBeenCalledWith('team-1', 'user-1', 'team_admin');
    });
  });
});
