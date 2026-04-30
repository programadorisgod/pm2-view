import { db } from '$lib/db';
import { eq, and } from 'drizzle-orm';
import { teamMembers } from '$lib/db/schema';
import type { TeamMember } from '$lib/db/schema';

/**
 * Gets the role of a user in a specific team.
 * Queries the team_members table to find the user's role.
 *
 * @param userId - The user ID to check
 * @param teamId - The team ID to check
 * @returns The role ('team_owner', 'team_admin', 'team_member') or null if not a member
 */
export async function getTeamRole(
	userId: string,
	teamId: string
): Promise<string | null> {
	const member = await db.query.teamMembers.findFirst({
		where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
	});

	return member?.role ?? null;
}

/**
 * Checks if a user is a member of a specific team.
 *
 * @param userId - The user ID to check
 * @param teamId - The team ID to check
 * @returns True if user is a member of the team
 */
export async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
	const role = await getTeamRole(userId, teamId);
	return role !== null;
}

/**
 * Checks if a user can manage a team (team_owner or team_admin).
 * Only team_owner and team_admin roles can manage team members and settings.
 *
 * @param userId - The user ID to check
 * @param teamId - The team ID to check
 * @returns True if user can manage the team
 */
export async function canManageTeam(userId: string, teamId: string): Promise<boolean> {
	const role = await getTeamRole(userId, teamId);
	
	if (!role) return false;
	
	return role === 'team_owner' || role === 'team_admin';
}
