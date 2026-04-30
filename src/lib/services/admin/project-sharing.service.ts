import { error } from '@sveltejs/kit';
import type { IProjectMemberRepository, ProjectMember } from '$lib/db/repositories/project-member-repository.interface';
import type { IAuditLogRepository } from '$lib/db/repositories/audit-log-repository.interface';
import { ProjectMemberRepository } from '$lib/db/repositories/project-member-repository.impl';
import { AuditLogRepository } from '$lib/db/repositories/audit-log-repository.impl';

export class ProjectSharingService {
  constructor(
    private projectMemberRepo: IProjectMemberRepository,
    private auditRepo: IAuditLogRepository
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
}

/**
 * Factory function to create ProjectSharingService with default repositories
 */
export function createProjectSharingService(): ProjectSharingService {
  return new ProjectSharingService(new ProjectMemberRepository(), new AuditLogRepository());
}
