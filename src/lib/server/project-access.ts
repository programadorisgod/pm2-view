import { db } from '$lib/db';
import { eq, and } from 'drizzle-orm';
import { projectMembers, projects } from '$lib/db/schema';
import type { ProjectMember } from '$lib/db/schema';

/**
 * Gets the role of a user in a specific project.
 * Checks both the project_members table and the project creator (userId = owner).
 *
 * @param userId - The user ID to check
 * @param projectId - The project ID to check
 * @returns The role ('owner', 'editor', 'viewer') or null if not a member
 */
export async function getProjectRole(
	userId: string,
	projectId: string
): Promise<string | null> {
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
