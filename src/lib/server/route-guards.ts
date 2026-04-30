import { error } from '@sveltejs/kit';
import type { AuthUser } from '$lib/auth/provider.interface';
import { db } from '$lib/db';
import { eq, and } from 'drizzle-orm';
import { projectMembers } from '$lib/db/schema';
import { getProjectRole } from './project-access';

/**
 * Throws a SvelteKit error if the user is not an admin.
 * Admin users have access to all routes.
 *
 * @param user - The authenticated user
 * @throws {Error} With status 403 if user is not admin
 */
export function requireAdmin(user: AuthUser): void {
	if (user.role !== 'admin') {
		throw error(403, 'Access denied: Admin role required');
	}
}

/**
 * Throws a SvelteKit error if the user does not have the required role.
 * Admin users automatically pass all role checks (admin has all roles).
 *
 * @param user - The authenticated user
 * @param role - The required role ('admin', 'user', 'viewer')
 * @throws {Error} With status 403 if user does not have the required role
 */
export function requireRole(user: AuthUser, role: string): void {
	// Admin has all roles
	if (user.role === 'admin') {
		return;
	}

	if (user.role !== role) {
		throw error(403, `Access denied: ${role} role required`);
	}
}

/**
 * Checks if a user has access to a project and optionally verifies a specific role.
 * Uses getProjectRole() which checks both project_members table and project creator.
 * Returns the member record if access is granted (or undefined for project creators).
 *
 * @param projectId - The project ID to check access for
 * @param userId - The user ID to check
 * @param requiredRole - Optional role requirement ('owner', 'editor', 'viewer')
 * @returns The project member record if available, or undefined for project creators
 * @throws {Error} With status 403 if user is not a project member
 * @throws {Error} With status 403 if user does not have the required role
 */
export async function requireProjectAccess(
	projectId: string,
	userId: string,
	requiredRole?: string
): Promise<typeof projectMembers.$inferSelect | undefined> {
	// Use getProjectRole to check access (checks both project_members and creator)
	const role = await getProjectRole(userId, projectId);

	if (!role) {
		// Changed from 404 to 403 for security (don't leak project existence)
		throw error(403, 'You do not have access to this project');
	}

	if (requiredRole && role !== requiredRole) {
		throw error(403, `Access denied: ${requiredRole} role required`);
	}

	// Fetch the member record if it exists (for project creators, there may not be a member record)
	const member = await db.query.projectMembers.findFirst({
		where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
	});

	return member; // Returns undefined for project creators without explicit member record
}
