import { db } from '$lib/db';
import { eq, and } from 'drizzle-orm';
import { projectMembers, projects, teamMembers } from '$lib/db/schema';
import type { ProjectMember } from '$lib/db/schema';

/**
 * Maps team roles to project roles.
 * team_owner → owner (full control)
 * team_admin → editor (can manage but not delete)
 * team_member → viewer (read-only)
 */
const TEAM_TO_PROJECT_ROLE: Record<string, string> = {
	team_owner: 'owner',
	team_admin: 'editor',
	team_member: 'viewer'
};

/**
 * Gets the role of a user in a specific project.
 * Checks in order: admin bypass → project_members → project creator → team membership.
 *
 * @param userId - The user ID to check
 * @param projectId - The project ID to check
 * @param globalRole - Optional global auth role ('admin', 'user', 'viewer') for admin bypass
 * @returns The role ('owner', 'editor', 'viewer') or null if not a member
 */
export async function getProjectRole(
	userId: string,
	projectId: string,
	globalRole?: string
): Promise<string | null> {
	// Admin has universal access — returns 'owner' level permissions
	if (globalRole === 'admin') {
		return 'owner';
	}

	// First check project_members table (highest priority)
	const member = await db.query.projectMembers.findFirst({
		where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
	});

	if (member) {
		return member.role;
	}

	// Check project details (creator + teamId)
	const project = await db.query.projects.findFirst({
		where: eq(projects.id, projectId),
		columns: { userId: true, teamId: true }
	});

	if (!project) return null;

	// Project creator
	if (project.userId === userId) {
		return 'owner';
	}

	// Team-based access (NEW)
	if (project.teamId) {
		const teamMember = await db.query.teamMembers.findFirst({
			where: and(eq(teamMembers.teamId, project.teamId), eq(teamMembers.userId, userId))
		});

		if (teamMember) {
			return TEAM_TO_PROJECT_ROLE[teamMember.role] ?? null;
		}
	}

	return null;
}

/**
 * Checks if a user is a member of a specific project.
 * Considers both project_members entry and project creator.
 *
 * @param userId - The user ID to check
 * @param projectId - The project ID to check
 * @returns True if user is a member (or creator) of the project
 */
export async function isProjectMember(userId: string, projectId: string): Promise<boolean> {
	const role = await getProjectRole(userId, projectId);
	return role !== null;
}

/**
 * Checks if a user can access a specific project.
 * Same as isProjectMember - checks both project_members and project creator.
 *
 * @param userId - The user ID to check
 * @param projectId - The project ID to check
 * @returns True if user can access the project
 */
export async function canAccessProject(userId: string, projectId: string): Promise<boolean> {
	const role = await getProjectRole(userId, projectId);
	return role !== null;
}
