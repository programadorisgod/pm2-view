import { error } from '@sveltejs/kit';
import type { IProjectMemberRepository, ProjectMember } from '$lib/db/repositories/project-member-repository.interface';
import type { IAuditLogRepository } from '$lib/db/repositories/audit-log-repository.interface';
import type { IProjectRepository, Project } from '$lib/projects/project.types';
import type { ITeamRepository, Team } from '$lib/db/repositories/team-repository.interface';
import { ProjectMemberRepository } from '$lib/db/repositories/project-member-repository.impl';
import { AuditLogRepository } from '$lib/db/repositories/audit-log-repository.impl';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { TeamRepository } from '$lib/db/repositories/team-repository.impl';

export class ProjectSharingService {
  constructor(
    private projectMemberRepo: IProjectMemberRepository,
    private auditRepo: IAuditLogRepository,
    private projectRepo: IProjectRepository,
    private teamRepo: ITeamRepository
  ) {}

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    return this.projectMemberRepo.findByProject(projectId);
  }

  async addMember(projectId: string, userId: string, role: string, actorId: string): Promise<void> {
    // Check not already member
    const existing = await this.projectMemberRepo.findMember(projectId, userId);
    if (existing) {
      throw error(409, 'User is already a member of this project');
    }

    await this.projectMemberRepo.add({
      projectId,
      userId,
      role
    });

    await this.auditRepo.create({
      action: 'project_member_add',
      actorId,
      targetId: userId,
      resourceType: 'project',
      resourceId: projectId,
      details: {
        projectId,
        userId,
        role
      }
    });
  }

  async removeMember(projectId: string, userId: string, actorId: string): Promise<void> {
    // Check member exists
    const member = await this.projectMemberRepo.findMember(projectId, userId);
    if (!member) {
      throw error(404, 'Project member not found');
    }

    // Check not last owner
    if (member.role === 'owner') {
      const allMembers = await this.projectMemberRepo.findByProject(projectId);
      const ownerCount = allMembers.filter(m => m.role === 'owner').length;
      if (ownerCount <= 1) {
        throw error(409, 'Cannot remove the last owner from the project');
      }
    }

    await this.projectMemberRepo.remove(projectId, userId);

    await this.auditRepo.create({
      action: 'project_member_remove',
      actorId,
      targetId: userId,
      resourceType: 'project',
      resourceId: projectId,
      details: {
        projectId,
        userId,
        role: member.role
      }
    });
  }

  async updateRole(projectId: string, userId: string, role: string, actorId: string): Promise<void> {
    // Check member exists
    const member = await this.projectMemberRepo.findMember(projectId, userId);
    if (!member) {
      throw error(404, 'Project member not found');
    }

    // Check not demoting last owner
    if (member.role === 'owner' && role !== 'owner') {
      const allMembers = await this.projectMemberRepo.findByProject(projectId);
      const ownerCount = allMembers.filter(m => m.role === 'owner').length;
      if (ownerCount <= 1) {
        throw error(409, 'Cannot demote the last owner of the project');
      }
    }

    await this.projectMemberRepo.updateRole(projectId, userId, role);

    await this.auditRepo.create({
      action: 'project_member_role_change',
      actorId,
      targetId: userId,
      resourceType: 'project',
      resourceId: projectId,
      details: {
        projectId,
        userId,
        oldRole: member.role,
        newRole: role
      }
    });
  }

  /**
   * Assign or reassign a project to a team.
   * @param projectId - The project ID
   * @param teamId - The team ID to assign, or null to unassign
   * @param actorId - The admin user ID performing the action
   */
  async assignToTeam(projectId: string, teamId: string | null, actorId: string): Promise<void> {
    // Check project exists
    const project = await this.projectRepo.getById(projectId);
    if (!project) {
      throw error(404, 'Project not found');
    }

    // If teamId provided, verify team exists
    if (teamId) {
      const team = await this.teamRepo.findById(teamId);
      if (!team) {
        throw error(404, 'Team not found');
      }
    }

    // Update project
    await this.projectRepo.update(projectId, { teamId } as Partial<Project>);

    // Audit log
    await this.auditRepo.create({
      action: 'project_team_assign',
      actorId,
      targetId: teamId ?? undefined,
      resourceType: 'project',
      resourceId: projectId,
      details: {
        projectName: project.name,
        from: project.teamId,
        to: teamId
      }
    });
  }

  /**
   * Get all teams for use in project assignment dropdown.
   */
  async getAllTeams(): Promise<Team[]> {
    const result = await this.teamRepo.findAll({ limit: 1000, offset: 0 });
    return result.teams;
  }
}

/**
 * Factory function to create ProjectSharingService with default repositories
 */
export function createProjectSharingService(): ProjectSharingService {
  return new ProjectSharingService(
    new ProjectMemberRepository(),
    new AuditLogRepository(),
    new ProjectRepository(),
    new TeamRepository()
  );
}
