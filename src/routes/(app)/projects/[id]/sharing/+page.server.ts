import { getProjectRole } from '$lib/server/project-access';
import { db } from '$lib/db';
import { projects, projectMembers, users, teams } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { createServices } from '$lib/services/factory';
import { isUuid } from '$lib/utils/ids';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const paramId = params.id;
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		let project;

		if (isUuid(paramId)) {
			// Direct DB UUID — look up by projects.id
			project = await db.query.projects.findFirst({
				where: eq(projects.id, paramId)
			});
		} else {
			// PM2 pm_id (numeric) — resolve via PM2Service → pm2Name
			const { pm2Service } = createServices();
			const pm2Process = await pm2Service.getProcessById(paramId);
			if (!pm2Process) {
				throw error(404, 'PM2 process not found');
			}

			project = await db.query.projects.findFirst({
				where: eq(projects.pm2Name, pm2Process.name)
			});

			// If not found by pm2Name, check if this process is a member of a group
			if (!project) {
				const allProjects = await db.query.projects.findMany({
					columns: { id: true, userId: true, teamId: true, name: true, pm2Name: true, pm2Names: true, description: true, targetPath: true, githubRepo: true, deployBranch: true, autoDeployEnabled: true, notifyEmail: true, createdAt: true }
				});
				project = allProjects.find(p => {
					if (!p.pm2Names) return false;
					try {
						const names = JSON.parse(p.pm2Names) as string[];
						return names.includes(pm2Process.name);
					} catch { return false; }
				}) ?? null;
			}

			// Auto-provision: create project record if it doesn't exist yet
			// Detect monorepo workspace root before creating
			if (!project) {
				const WORKSPACE_INDICATORS = [
					'pnpm-workspace.yaml', 'lerna.json', 'nx.json',
					'turbo.json', 'rush.json', '.yarnrc.yml',
				];
				const cwd = (pm2Process.pm2_env?.pm_cwd ?? '').replace(/\/+$/, '');
				let workspaceRoot: string | null = null;
				if (cwd) {
					let dir = cwd;
					for (let i = 0; i < 4; i++) {
						for (const file of WORKSPACE_INDICATORS) {
							if (existsSync(join(dir, file))) { workspaceRoot = dir; break; }
						}
						if (!workspaceRoot) {
							const pkgPath = join(dir, 'package.json');
							if (existsSync(pkgPath)) {
								try {
									const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
									if (pkg.workspaces) workspaceRoot = dir;
								} catch { /* ignore */ }
							}
						}
						if (workspaceRoot) break;
						const parent = dirname(dir);
						if (parent === dir) break;
						dir = parent;
					}
				}

				// Find all processes in the workspace
				let groupPm2Names: string[] | undefined;
				let targetPath = pm2Process.pm2_env?.pm_cwd || null;
				let projectName = pm2Process.name;

				if (workspaceRoot) {
					const { pm2Service } = createServices();
					const allProcesses = await pm2Service.getAllProcesses();
					const groupProcesses = allProcesses.filter(p => {
						const pCwd = (p.pm2_env?.pm_cwd ?? '').replace(/\/+$/, '');
						return pCwd.startsWith(workspaceRoot + '/') || pCwd === workspaceRoot;
					});
					if (groupProcesses.length > 1) {
						groupPm2Names = groupProcesses.map(p => p.name);
						targetPath = workspaceRoot;
						projectName = basename(workspaceRoot);
					}
				}

				const primaryName = groupPm2Names ? groupPm2Names[0] : pm2Process.name;
				const [created] = await db.insert(projects).values({
					id: crypto.randomUUID(),
					userId: locals.user.id,
					name: projectName,
					pm2Name: primaryName,
					description: groupPm2Names
						? `PM2 group: ${groupPm2Names.join(', ')}`
						: `PM2 process: ${pm2Process.name}`,
					targetPath,
					pm2Names: groupPm2Names ? JSON.stringify(groupPm2Names) : null,
				}).returning();
				project = created;
			}
		}

		if (!project) {
			throw error(404, 'Project not found');
		}

		const projectDbId = project.id;

		// Check project access (admin bypass included)
		const hasAccess = await getProjectRole(locals.user.id, projectDbId, locals.user.role);
		if (!hasAccess) {
			throw error(403, 'You do not have access to this project');
		}

		const members = await db.query.projectMembers.findMany({
			where: eq(projectMembers.projectId, projectDbId),
			with: {
				user: { columns: { id: true, email: true, name: true, role: true } }
			}
		});

		const allUsers = await db.select({ id: users.id, email: users.email, name: users.name })
			.from(users);

		const memberIds = new Set(members.map(m => m.userId));
		const availableUsers = allUsers.filter(u => !memberIds.has(u.id));

		// Get team info if project belongs to a team
		let teamInfo = null;
		if (project.teamId) {
			const team = await db.query.teams.findFirst({
				where: eq(teams.id, project.teamId),
				columns: { id: true, name: true }
			});
			if (team) {
				teamInfo = team;
			}
		}

		return {
			project: { id: project.id, name: project.name, pm2Name: project.pm2Name, teamId: project.teamId },
			members: members.map(m => ({
				id: m.id,
				userId: m.userId,
				role: m.role,
				name: m.user?.name ?? '',
				email: m.user?.email ?? ''
			})),
			availableUsers,
			team: teamInfo,
			userRole: locals.user.role
		};
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to load sharing data:', e);
		throw error(500, 'Failed to load sharing data');
	}
};
