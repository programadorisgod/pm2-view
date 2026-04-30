import type { ProjectMember } from '../schema/project-members';

export type { ProjectMember };

/**
 * Interface for Project Member repository operations
 * Manages project membership (owners, editors, viewers)
 */
export interface IProjectMemberRepository {
  /**
   * Find all members of a project
   * @param projectId - The project ID
   * @returns Array of project members with user info
   */
  findByProject(projectId: string): Promise<ProjectMember[]>;

  /**
   * Find all projects a user is a member of
   * @param userId - The user ID
   * @returns Array of project memberships
   */
  findByUser(userId: string): Promise<ProjectMember[]>;

  /**
   * Find a specific member in a project
   * @param projectId - The project ID
   * @param userId - The user ID
   * @returns The project member or null if not found
   */
  findMember(projectId: string, userId: string): Promise<ProjectMember | null>;

  /**
   * Add a member to a project (idempotent - updates role if already exists)
   * @param member - The member data (projectId, userId, role)
   * @returns The created or updated project member
   */
  add(member: { projectId: string; userId: string; role: string }): Promise<ProjectMember>;

  /**
   * Remove a member from a project
   * @param projectId - The project ID
   * @param userId - The user ID
   */
  remove(projectId: string, userId: string): Promise<void>;

  /**
   * Update a member's role in a project
   * @param projectId - The project ID
   * @param userId - The user ID
   * @param role - The new role ('owner', 'editor', 'viewer')
   */
  updateRole(projectId: string, userId: string, role: string): Promise<void>;
}
