import { db } from '$lib/db';
import { eq, and } from 'drizzle-orm';
import { projects, projectMembers, teamMembers, users } from '$lib/db/schema';

/**
 * Shared recipient collector for all project notifications.
 *
 * Resolves emails from three access models:
 *  1. Project owner (projects.userId)
 *  2. Project members (project_members table)
 *  3. Team members (team_members table, when project has a teamId)
 *
 * Role hierarchy (lowest to highest):
 *   viewer < editor < owner
 *
 * Team roles map to project roles:
 *   team_member → viewer, team_admin → editor, team_owner → owner
 *
 * @param projectId - The project to collect recipients for
 * @param minRole - Minimum role level to include. null includes everyone.
 *   - 'owner':   only project owners and team_owners
 *   - 'editor':  owners + editors (team_owners + team_admins)
 *   - 'viewer':  everyone with any access level
 */
export async function collectProjectNotificationEmails(
	projectId: string,
	minRole: 'owner' | 'editor' | 'viewer' | null = 'viewer'
): Promise<string[]> {
	const emails = new Set<string>();

	// 1. Project owner
	const project = await db.query.projects.findFirst({
		where: eq(projects.id, projectId),
		columns: { userId: true, teamId: true }
	});

	if (!project) return [];

	const ownerEmail = await getUserEmail(project.userId);
	if (ownerEmail && roleMeetsMinimum('owner', minRole)) {
		emails.add(normalizeEmail(ownerEmail));
	}

	// 2. Project members (individual sharing)
	const members = await db.query.projectMembers.findMany({
		where: eq(projectMembers.projectId, projectId),
		with: { user: { columns: { email: true } } }
	});

	for (const member of members) {
		if (member.user?.email && roleMeetsMinimum(member.role, minRole)) {
			emails.add(normalizeEmail(member.user.email));
		}
	}

	// 3. Team members (when project belongs to a team)
	if (project.teamId) {
		const teamEmails = await getTeamMemberEmailsByRole(project.teamId);
		for (const entry of teamEmails) {
			if (roleMeetsMinimum(entry.role, minRole)) {
				emails.add(normalizeEmail(entry.email));
			}
		}
	}

	return [...emails];
}

/** Team role mapped to its project-role equivalent. */
const TEAM_ROLE_MAP: Record<string, string> = {
	team_owner: 'owner',
	team_admin: 'editor',
	team_member: 'viewer'
};

/** Role precedence for filtering. */
const ROLE_LEVEL: Record<string, number> = {
	owner: 3,
	editor: 2,
	viewer: 1
};

function roleMeetsMinimum(role: string, minRole: string | null): boolean {
	if (!minRole) return true;
	const mappedRole = TEAM_ROLE_MAP[role] ?? role;
	const level = ROLE_LEVEL[mappedRole] ?? 0;
	const minLevel = ROLE_LEVEL[minRole] ?? 0;
	return level >= minLevel;
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

async function getUserEmail(userId: string): Promise<string | null> {
	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { email: true }
	});
	return user?.email ?? null;
}

interface TeamMemberEmailEntry {
	email: string;
	/** The team role mapped to a project role for comparison. */
	role: string;
}

async function getTeamMemberEmailsByRole(teamId: string): Promise<TeamMemberEmailEntry[]> {
	const members = await db.query.teamMembers.findMany({
		where: eq(teamMembers.teamId, teamId),
		with: { user: { columns: { email: true } } }
	});

	const result: TeamMemberEmailEntry[] = [];
	for (const member of members) {
		if (member.user?.email) {
			result.push({
				email: member.user.email,
				role: TEAM_ROLE_MAP[member.role] ?? 'viewer'
			});
		}
	}
	return result;
}
