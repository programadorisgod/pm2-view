import { error } from '@sveltejs/kit';
import type { ITeamRepository, Team, TeamWithMemberCount, TeamMember } from '$lib/db/repositories/team-repository.interface';
import type { IAuditLogRepository } from '$lib/db/repositories/audit-log-repository.interface';
import { TeamRepository } from '$lib/db/repositories/team-repository.impl';
import { AuditLogRepository } from '$lib/db/repositories/audit-log-repository.impl';

export interface TeamListResult {
  teams: TeamWithMemberCount[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateTeamInput {
  name: string;
  description?: string;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string;
}

export class TeamService {
  constructor(
    private teamRepo: ITeamRepository,
    private auditRepo: IAuditLogRepository
  ) {}

  async listTeams(options: { page?: number; limit?: number }): Promise<TeamListResult> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const offset = (page - 1) * limit;

    const result = await this.teamRepo.findAll({ limit, offset });

    const totalPages = Math.ceil(result.total / limit);

    return {
      teams: result.teams,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages
      }
    };
  }

  async createTeam(input: CreateTeamInput, actorId: string): Promise<Team> {
    // Check duplicate name
    const existingTeams = await this.teamRepo.findAll({ limit: 1000, offset: 0 });
    const duplicate = existingTeams.teams.find(t => t.name.toLowerCase() === input.name.toLowerCase());
    if (duplicate) {
      throw error(409, `Team with name "${input.name}" already exists`);
    }

    // Create team (repo auto-adds owner via ownerId)
    const team = await this.teamRepo.create({
      name: input.name,
      description: input.description,
      ownerId: actorId
    });

    await this.auditRepo.create({
      action: 'team_create',
      actorId,
      targetId: team.id,
      resourceType: 'team',
      resourceId: team.id,
      details: {
        name: team.name,
        description: team.description
      }
    });

    return team;
  }

  async getTeam(id: string): Promise<Team | null> {
    return this.teamRepo.findById(id);
  }

  async updateTeam(id: string, updates: UpdateTeamInput, actorId: string): Promise<Team> {
    // Check team exists
    const existing = await this.teamRepo.findById(id);
    if (!existing) {
      throw error(404, 'Team not found');
    }

    // Check duplicate name if renaming
    if (updates.name && updates.name !== existing.name) {
      const allTeams = await this.teamRepo.findAll({ limit: 1000, offset: 0 });
      const duplicate = allTeams.teams.find(t => t.name.toLowerCase() === updates.name!.toLowerCase() && t.id !== id);
      if (duplicate) {
        throw error(409, `Team with name "${updates.name}" already exists`);
      }
    }

    const updated = await this.teamRepo.update(id, updates);

    await this.auditRepo.create({
      action: 'team_update',
      actorId,
      targetId: id,
      resourceType: 'team',
      resourceId: id,
      details: { ...updates }
    });

    return updated;
  }

  async deleteTeam(id: string, actorId: string): Promise<void> {
    // Check team exists
    const existing = await this.teamRepo.findById(id);
    if (!existing) {
      throw error(404, 'Team not found');
    }

    // Delete team (repo handles member cleanup)
    await this.teamRepo.delete(id);

    await this.auditRepo.create({
      action: 'team_delete',
      actorId,
      targetId: id,
      resourceType: 'team',
      resourceId: id,
      details: {
        name: existing.name
      }
    });
  }

  async addMember(teamId: string, userId: string, role: string, actorId: string): Promise<void> {
    // Check team exists
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw error(404, 'Team not found');
    }

    // Check not already member
    const existingMember = await this.teamRepo.findMember(teamId, userId);
    if (existingMember) {
      throw error(409, 'User is already a member of this team');
    }

    await this.teamRepo.addMember(teamId, userId, role);

    await this.auditRepo.create({
      action: 'team_member_add',
      actorId,
      targetId: userId,
      resourceType: 'team',
      resourceId: teamId,
      details: {
        teamId,
        userId,
        role
      }
    });
  }

  async removeMember(teamId: string, userId: string, actorId: string): Promise<void> {
    // Check member exists
    const member = await this.teamRepo.findMember(teamId, userId);
    if (!member) {
      throw error(404, 'Team member not found');
    }

    // Check not last owner
    if (member.role === 'team_owner') {
      const ownerCount = await this.teamRepo.countOwners(teamId);
      if (ownerCount <= 1) {
        throw error(409, 'Cannot remove the last owner from the team');
      }
    }

    await this.teamRepo.removeMember(teamId, userId);

    await this.auditRepo.create({
      action: 'team_member_remove',
      actorId,
      targetId: userId,
      resourceType: 'team',
      resourceId: teamId,
      details: {
        teamId,
        userId,
        role: member.role
      }
    });
  }

  async updateMemberRole(teamId: string, userId: string, role: string, actorId: string): Promise<void> {
    // Check member exists
    const member = await this.teamRepo.findMember(teamId, userId);
    if (!member) {
      throw error(404, 'Team member not found');
    }

    // Check not demoting last owner
    if (member.role === 'team_owner' && role !== 'team_owner') {
      const ownerCount = await this.teamRepo.countOwners(teamId);
      if (ownerCount <= 1) {
        throw error(409, 'Cannot demote the last owner of the team');
      }
    }

    await this.teamRepo.updateMemberRole(teamId, userId, role);

    await this.auditRepo.create({
      action: 'team_member_role_change',
      actorId,
      targetId: userId,
      resourceType: 'team',
      resourceId: teamId,
      details: {
        teamId,
        userId,
        oldRole: member.role,
        newRole: role
      }
    });
  }

  async getMember(teamId: string, userId: string): Promise<TeamMember | null> {
    // Check team exists
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw error(404, 'Team not found');
    }

    return this.teamRepo.findMember(teamId, userId);
  }
}

/**
 * Factory function to create TeamService with default repositories
 */
export function createTeamService(): TeamService {
  return new TeamService(new TeamRepository(), new AuditLogRepository());
}
