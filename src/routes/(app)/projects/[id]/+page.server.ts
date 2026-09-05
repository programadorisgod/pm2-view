import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
import type { DeployConfig } from '$lib/deploy-config/deploy-config.types';
import { createServices } from '$lib/services/factory';
import { auth } from '$lib/auth';
import { db } from '$lib/db';
import { eq } from 'drizzle-orm';
import { projects } from '$lib/db/schema';
import { error } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, request }) => {
	const { pm2Service } = createServices();
	const { id } = params;

	const process = await pm2Service.getProcessById(id);

	if (!process) {
		throw error(404, `Process with ID ${id} not found`);
	}

	// Get logs (limited to 50 lines for the detail page)
	const logs = await pm2Service.getProcessLogs(id, 50);

	// Get session for user-dependent operations
	const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);

	// Get favorite status
	let isFavorite = false;
	try {
		if (session?.user) {
			const { ProjectFavoriteRepository } = await import('$lib/db/repositories/project-favorite-repository.impl');
			const favRepo = new ProjectFavoriteRepository();
			isFavorite = await favRepo.isFavorite(session.user.id, process.name);
		}
	} catch {
		// Silent fail - favorite status is non-critical
	}

	// Get deploy configuration (auto-provisions project if not registered)
	let deployConfig: DeployConfig = { install: [], build: [], restart: [], postDeploy: [] };
	let projectInternalId: string | null = null;
	let autoDeploySettings = { autoDeployEnabled: false, githubRepo: null as string | null, deployBranch: 'main', targetPath: undefined as string | undefined, pm2Names: [] as string[], pm2Name: '' as string };
	let groupProcesses: typeof process[] = [];
	let projectName = process.name;
	try {
		// Find project by pm2_name to get internal ID
		let project = await db.query.projects.findFirst({
			where: eq(projects.pm2Name, process.name),
			columns: { id: true, name: true, autoDeployEnabled: true, githubRepo: true, deployBranch: true, targetPath: true, pm2Name: true, pm2Names: true }
		});

		// If not found by pm2Name, check if this process is a member of a group
		if (!project) {
			const allProjects = await db.query.projects.findMany({
				columns: { id: true, name: true, autoDeployEnabled: true, githubRepo: true, deployBranch: true, targetPath: true, pm2Name: true, pm2Names: true }
			});
			project = allProjects.find(p => {
				if (!p.pm2Names) return false;
				try {
					const names = JSON.parse(p.pm2Names) as string[];
					return names.includes(process.name);
				} catch { return false; }
			}) ?? null;
		}

		// Always detect workspace root for monorepo grouping
		let workspaceRoot: string | null = null;
		const WORKSPACE_INDICATORS = [
			'pnpm-workspace.yaml', 'lerna.json', 'nx.json',
			'turbo.json', 'rush.json', '.yarnrc.yml',
		];
		const cwd = (process.pm2_env?.pm_cwd ?? '').replace(/\/+$/, '');
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

		// Find all workspace processes for grouping
		if (workspaceRoot) {
			const allProcesses = await pm2Service.getAllProcesses();
			groupProcesses = allProcesses.filter(p => {
				const pCwd = (p.pm2_env?.pm_cwd ?? '').replace(/\/+$/, '');
				return pCwd.startsWith(workspaceRoot + '/') || pCwd === workspaceRoot;
			});
			if (groupProcesses.length > 1) {
				projectName = basename(workspaceRoot);
			}
		}

		// If project found but is individual and workspace has groups → upgrade to group
		if (project && !project.pm2Names && groupProcesses.length > 1) {
			const groupPm2Names = groupProcesses.map(p => p.name);
			await db.update(projects).set({
				name: projectName,
				pm2Names: JSON.stringify(groupPm2Names),
				description: `PM2 group: ${groupPm2Names.join(', ')}`,
				targetPath: workspaceRoot,
			}).where(eq(projects.id, project.id));
			// Refresh project data
			project = await db.query.projects.findFirst({
				where: eq(projects.id, project.id),
				columns: { id: true, name: true, autoDeployEnabled: true, githubRepo: true, deployBranch: true, targetPath: true, pm2Name: true, pm2Names: true }
			}) ?? project;
		}

		// Auto-provision: register project if it doesn't exist yet
		if (!project && session?.user) {
			const isGroup = groupProcesses.length > 1;
			const groupPm2Names = isGroup ? groupProcesses.map(p => p.name) : undefined;
			const primaryName = isGroup ? groupProcesses[0].name : process.name;

			const [created] = await db.insert(projects).values({
				id: crypto.randomUUID(),
				userId: session.user.id,
				name: projectName,
				pm2Name: primaryName,
				description: isGroup
					? `PM2 group: ${groupProcesses.map(p => p.name).join(', ')}`
					: `PM2 process: ${process.name}`,
				targetPath: (isGroup ? workspaceRoot : process.pm2_env.pm_cwd) || null,
				pm2Names: isGroup ? JSON.stringify(groupPm2Names) : null,
			}).returning({
				id: projects.id,
				autoDeployEnabled: projects.autoDeployEnabled,
				githubRepo: projects.githubRepo,
				deployBranch: projects.deployBranch,
				targetPath: projects.targetPath,
				pm2Name: projects.pm2Name,
				pm2Names: projects.pm2Names
			});
			project = created;
		}

		if (project) {
			projectInternalId = project.id;
			projectName = project.name || process.name;
			autoDeploySettings = {
				autoDeployEnabled: project.autoDeployEnabled,
				githubRepo: project.githubRepo,
				deployBranch: project.deployBranch,
				targetPath: project.targetPath ?? undefined,
				pm2Names: project.pm2Names ? JSON.parse(project.pm2Names) as string[] : [],
				pm2Name: project.pm2Name
			};

			// Load all processes in the group
			if (autoDeploySettings.pm2Names.length > 0) {
				const allProcesses = await pm2Service.getAllProcesses();
				groupProcesses = allProcesses.filter(p => autoDeploySettings.pm2Names.includes(p.name));
			}

			const deployConfigRepo = new DeployConfigRepository();
			const commands = await deployConfigRepo.getByProjectId(project.id);
			// Group by command type
			deployConfig = {
				install: commands.filter((c) => c.commandType === 'install'),
				build: commands.filter((c) => c.commandType === 'build'),
				restart: commands.filter((c) => c.commandType === 'restart'),
				postDeploy: commands.filter((c) => c.commandType === 'post-deploy'),
			};
		}
	} catch {
		// Non-critical: deploy config fetch failure
	}

	return {
		process,
		logs,
		isFavorite,
		deployConfig,
		projectInternalId,
		projectName,
		autoDeploySettings,
		groupProcesses,
	};
};
