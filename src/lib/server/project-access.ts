import { db } from '$lib/db';
import { eq, and } from 'drizzle-orm';
import { projectMembers, projects } from '$lib/db/schema';
import type { ProjectMember } from '$lib/db/schema';

/**
 * Gets the role of a user in a specific project.
 * Checks global role first (admin bypass), then project_members table, then project creator.
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

	// First check project_members table
	const member = await db.query.projectMembers.findFirst({
		where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
	});

	if (member) {
		return member.role;
	}

	// If not in project_members, check if user is the project creator (owner)
	const project = await db.query.projects.findFirst({
		where: eq(projects.id, projectId),
		columns: { userId: true }
	});

	if (project && project.userId === userId) {
		return 'owner';
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
