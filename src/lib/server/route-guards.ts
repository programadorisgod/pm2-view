import { error } from '@sveltejs/kit';
import type { AuthUser } from '$lib/auth/provider.interface';
import { db } from '$lib/db';
import { eq, and } from 'drizzle-orm';
import { projectMembers } from '$lib/db/schema';

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
 * Queries the project_members table to find the user's role in the project.
 * Returns the member record if access is granted.
 *
 * @param projectId - The project ID to check access for
 * @param userId - The user ID to check
 * @param requiredRole - Optional role requirement ('owner', 'editor', 'viewer')
 * @returns The project member record if access is granted
 * @throws {Error} With status 404 if user is not a project member
 * @throws {Error} With status 403 if user does not have the required role
 */
export async function requireProjectAccess(
	projectId: string,
	userId: string,
	requiredRole?: string
): Promise<typeof projectMembers.$inferSelect> {
	const member = await db.query.projectMembers.findFirst({
		where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
	});

	if (!member) {
		throw error(404, 'Project not found');
	}

	if (requiredRole && member.role !== requiredRole) {
		throw error(403, `Access denied: ${requiredRole} role required`);
	}

	return member;
}
