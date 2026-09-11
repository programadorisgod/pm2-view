import { error } from '@sveltejs/kit';
import type { AuthUser } from '$lib/auth/provider.interface';
import { db } from '$lib/db';
import { eq, and } from 'drizzle-orm';
import { projectMembers } from '$lib/db/schema';
import { getProjectRole } from './project-access';

const ROLE_HIERARCHY: Record<string, number> = {
	owner: 3,
	editor: 2,
	viewer: 1
};

export function requireAdmin(user: AuthUser): void {
	if (user.banned) {
		throw error(403, 'Account is banned');
	}
	if (user.role !== 'admin') {
		throw error(403, 'Access denied: Admin role required');
	}
}

export function requireRole(user: AuthUser, role: string): void {
	if (user.banned) {
		throw error(403, 'Account is banned');
	}
	// Admin has all roles
	if (user.role === 'admin') {
		return;
	}

	if (user.role !== role) {
		throw error(403, `Access denied: ${role} role required`);
	}
}

export async function requireProjectAccess(
	projectId: string,
	user: AuthUser,
	requiredRole?: string
): Promise<typeof projectMembers.$inferSelect | undefined> {
	if (user.banned) {
		throw error(403, 'Account is banned');
	}

	// Admin has universal access to all projects
	if (user.role === 'admin') {
		const member = await (db as any).query.projectMembers.findFirst({
			where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id))
		});
		return member;
	}

	// Use getProjectRole to check access (checks both project_members and creator)
	const role = await getProjectRole(user.id, projectId, user.role);

	if (!role) {
		throw error(403, 'You do not have access to this project');
	}

	if (requiredRole) {
		const userWeight = ROLE_HIERARCHY[role] ?? 0;
		const requiredWeight = ROLE_HIERARCHY[requiredRole] ?? 0;
		if (userWeight < requiredWeight) {
			throw error(403, `Access denied: ${requiredRole} role required`);
		}
	}

	// Fetch the member record if it exists (for project creators, there may not be a member record)
	const member = await (db as any).query.projectMembers.findFirst({
		where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id))
	});

	return member;
}

