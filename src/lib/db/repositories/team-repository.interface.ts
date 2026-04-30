import type { Team, TeamMember } from '../schema/teams';

export type { Team, TeamMember };

/**
 * Team with member count for list views
 */
export type TeamWithMemberCount = Team & {
  memberCount: number;
};

/**
 * Interface for Team repository operations
 * Follows the same pattern as IProjectRepository
 */
export interface ITeamRepository {
  /**
   * Find a team by its ID
   * @param id - The team ID
   * @returns The team or null if not found
   */
  findById(id: string): Promise<Team | null>;

  /**
   * Find all teams with pagination
   * @param options - Pagination options (limit, offset)
   * @returns Teams with member counts and total count
   */
  findAll(options: { limit: number; offset: number }): Promise<{ teams: TeamWithMemberCount[]; total: number }>;

  /**
   * Create a new team
   * @param team - Team data (name, description, ownerId)
   * @returns The created team
   */
  create(team: { name: string; description?: string; ownerId: string }): Promise<Team>;

  /**
   * Update a team
   * @param id - The team ID
   * @param data - Fields to update (name, description)
   * @returns The updated team
   */
  update(id: string, data: { name?: string; description?: string }): Promise<Team>;

  /**
   * Delete a team (and its members via cascade)
   * @param id - The team ID
   */
  delete(id: string): Promise<void>;

  /**
   * Add a member to a team
   * @param teamId - The team ID
   * @param userId - The user ID
   * @param role - The role ('team_owner', 'team_admin', 'team_member')
   * @returns The created team member record
   */
  addMember(teamId: string, userId: string, role: string): Promise<TeamMember>;

  /**
   * Remove a member from a team
   * @param teamId - The team ID
   * @param userId - The user ID
   */
  removeMember(teamId: string, userId: string): Promise<void>;

  /**
   * Update a member's role in a team
   * @param teamId - The team ID
   * @param userId - The user ID
   * @param role - The new role
   */
  updateMemberRole(teamId: string, userId: string, role: string): Promise<void>;

  /**
   * Count the number of owners in a team
   * @param teamId - The team ID
   * @returns The count of owners
   */
  countOwners(teamId: string): Promise<number>;

  /**
   * Find a specific team member
   * @param teamId - The team ID
   * @param userId - The user ID
   * @returns The team member or null if not found
   */
  findMember(teamId: string, userId: string): Promise<TeamMember | null>;

  /**
   * Get all teams a user belongs to
   * @param userId - The user ID
   * @returns Array of teams the user belongs to
   */
  getUserTeams(userId: string): Promise<Team[]>;
}
