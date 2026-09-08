import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
import { DeployConfigService } from '$lib/deploy-config/deploy-config.service';
import type { DeployConfig } from '$lib/deploy-config/deploy-config.types';
import { createServices } from '$lib/services/factory';
import { auth } from '$lib/auth';
import { db } from '$lib/db/db';
import { eq } from 'drizzle-orm';
import { projects } from '$lib/db/schema';
import { error } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, request }) => {
	const { pm2Service } = createServices();
	const { id } = params;

	// Fast lookup of the target process
	let process = await pm2Service.getProcessById(id);

	// If not found by PM2 ID / name, check if ID corresponds to a DB project
	let dbProjectFallback: any = null;
	if (!process) {
		dbProjectFallback = await db.query.projects.findFirst({
			where: eq(projects.id, id)
		});
		if (dbProjectFallback) {
			process = await pm2Service.getProcessById(dbProjectFallback.pm2Name);
		}
	}

	if (!process && !dbProjectFallback) {
		throw error(404, `Process with ID ${id} not found`);
	}

	// Create fallback synthetic process if offline
	if (!process && dbProjectFallback) {
		process = {
			name: dbProjectFallback.name || dbProjectFallback.pm2Name,
			pm_id: -1,
			monit: { cpu: 0, memory: 0 },
			pm2_env: {
				status: 'stopped',
				pm_uptime: 0,
				restart_time: 0,
				pm_cwd: dbProjectFallback.targetPath || undefined
			},
			status: 'offline',
			cpu: 0,
			memoryMB: 0,
			uptimeFormatted: 'Not running'
		};
	}

	// Target process is guaranteed to be non-null here
	const targetProcess = process!;

	// Parallelize initial independent tasks: logs, session, and DB project lookup
	const [logs, session, foundProject] = await Promise.all([
		targetProcess.pm_id !== -1 ? pm2Service.getProcessLogs(id, 50).catch(() => []) : Promise.resolve([]),
		auth.api.getSession({ headers: request.headers }).catch(() => null),
		dbProjectFallback ? Promise.resolve(dbProjectFallback) : db.query.projects.findFirst({
			where: eq(projects.pm2Name, targetProcess.name),
			columns: { id: true, name: true, autoDeployEnabled: true, githubRepo: true, deployBranch: true, targetPath: true, pm2Name: true, pm2Names: true }
		}).catch(() => null)
	]);

	// Favorite status (parallel with project processing if possible)
	let isFavorite = false;
	if (session?.user) {
		try {
			const { ProjectFavoriteRepository } = await import('$lib/db/repositories/project-favorite-repository.impl');
			const favRepo = new ProjectFavoriteRepository();
			isFavorite = await favRepo.isFavorite(session.user.id, targetProcess.name);
		} catch {
			// Silent fail - favorite status is non-critical
		}
	}

	let deployConfig: DeployConfig = { install: [], build: [], restart: [], start: [], postDeploy: [] };
	let projectInternalId: string | null = null;
	let autoDeploySettings = {
		autoDeployEnabled: false,
		githubRepo: null as string | null,
		deployBranch: 'main',
		targetPath: undefined as string | undefined,
		pm2Names: [] as string[],
		pm2Name: '' as string
	};
	let groupProcesses: typeof targetProcess[] = [];
	let projectName = targetProcess.name;

	try {
		let project = foundProject;

		// If not found directly by pm2Name, search in project groups
		if (!project) {
			const allProjects = await db.query.projects.findMany({
				columns: { id: true, name: true, autoDeployEnabled: true, githubRepo: true, deployBranch: true, targetPath: true, pm2Name: true, pm2Names: true }
			});
			project = allProjects.find(p => {
				if (!p.pm2Names) return false;
				try {
					const names = JSON.parse(p.pm2Names) as string[];
					return names.includes(targetProcess.name);
				} catch { return false; }
			}) ?? null;
		}

		// Detect workspace root for grouping
		let workspaceRoot: string | null = null;
		const WORKSPACE_INDICATORS = [
			'pnpm-workspace.yaml', 'lerna.json', 'nx.json',
			'turbo.json', 'rush.json', '.yarnrc.yml',
		];
		const cwd = (targetProcess.pm2_env?.pm_cwd ?? '').replace(/\/+$/, '');
		if (cwd) {
			let dir = cwd;
			for (let i = 0; i < 3; i++) {
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

		// Find group processes if workspace detected or project has pm2Names
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

		if (project) {
			projectInternalId = project.id;
			projectName = project.name || targetProcess.name;
			autoDeploySettings = {
				autoDeployEnabled: project.autoDeployEnabled,
				githubRepo: project.githubRepo,
				deployBranch: project.deployBranch,
				targetPath: project.targetPath ?? undefined,
				pm2Names: project.pm2Names ? JSON.parse(project.pm2Names) as string[] : [],
				pm2Name: project.pm2Name
			};

			if (autoDeploySettings.pm2Names.length > 0 && groupProcesses.length === 0) {
				const allProcesses = await pm2Service.getAllProcesses();
				groupProcesses = allProcesses.filter(p => autoDeploySettings.pm2Names.includes(p.name));
			}

			const deployConfigRepo = new DeployConfigRepository();
			const deployConfigService = new DeployConfigService(deployConfigRepo);
			deployConfig = await deployConfigService.getConfig(project.id);
		}
	} catch {
		// Non-critical: deploy config fetch failure
	}

	return {
		process: targetProcess,
		logs,
		isFavorite,
		deployConfig,
		projectInternalId,
		projectName,
		autoDeploySettings,
		groupProcesses,
	};
};
