import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
import { DeployConfigService } from '$lib/deploy-config/deploy-config.service';
import type { DeployConfig } from '$lib/deploy-config/deploy-config.types';
import { createServices } from '$lib/services/factory';
import { auth } from '$lib/auth';
import { db } from '$lib/db/db';
import { eq } from 'drizzle-orm';
import { projects } from '$lib/db/schema';
import { error } from '@sveltejs/kit';
import { basename } from 'path';
import { WorkspaceDetector } from '$lib/services/project-listing/workspace-detector';
import type { PM2Process } from '$lib/pm2/pm2.types';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, request, locals }) => {
	const { pm2Service } = createServices();
	const { id } = params;

	// Fast lookup of the target process
	let process = await pm2Service.getProcessById(id);

	// If not found by PM2 ID / name, check if ID corresponds to a DB project
	let dbProjectFallback: any = null;
	if (!process) {
		dbProjectFallback = await db.query.projects.findFirst({
			where: eq(projects.id, id)
		}).catch(() => null);
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

	// Resolve user from locals (populated by hook) without hitting DB session endpoint again
	const user = locals?.user ?? (request?.headers ? (await auth.api.getSession({ headers: request.headers }).catch(() => null))?.user : null);

	// Parallelize DB project lookup and favorite status if user is present
	const [foundProject, isFavorite] = await Promise.all([
		dbProjectFallback ? Promise.resolve(dbProjectFallback) : db.query.projects.findFirst({
			where: eq(projects.pm2Name, targetProcess.name),
			columns: { id: true, name: true, autoDeployEnabled: true, githubRepo: true, deployBranch: true, targetPath: true, pm2Name: true, pm2Names: true }
		}).catch(() => null),
		user ? (async () => {
			try {
				const { ProjectFavoriteRepository } = await import('$lib/db/repositories/project-favorite-repository.impl');
				const favRepo = new ProjectFavoriteRepository();
				return await favRepo.isFavorite(user.id, targetProcess.name);
			} catch {
				return false;
			}
		})() : Promise.resolve(false)
	]);

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
			}).catch(() => []);
			project = allProjects.find(p => {
				if (!p.pm2Names) return false;
				try {
					const names = JSON.parse(p.pm2Names) as string[];
					return names.includes(targetProcess.name);
				} catch { return false; }
			}) ?? null;
		}

		// Detect workspace root for grouping via bounded TTL cache
		const cwd = (targetProcess.pm2_env?.pm_cwd ?? '').replace(/\/+$/, '');
		const workspaceRoot = cwd ? WorkspaceDetector.getWorkspaceRoot(cwd, 3) : null;

		let cachedAllProcesses: PM2Process[] | null = null;
		const getAllProcessesLazy = async () => {
			if (!cachedAllProcesses) {
				cachedAllProcesses = await pm2Service.getAllProcesses();
			}
			return cachedAllProcesses;
		};

		// Find group processes if workspace detected or project has pm2Names
		if (workspaceRoot) {
			const allProcesses = await getAllProcessesLazy();
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
				const allProcesses = await getAllProcessesLazy();
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
		logs: [],
		isFavorite,
		deployConfig,
		projectInternalId,
		projectName,
		autoDeploySettings,
		groupProcesses,
	};
};

export const actions: Actions = {
	saveEnv: async ({ request, locals, params }) => {
		if (locals.memberRole === 'viewer') {
			throw error(403, 'Forbidden');
		}
		const formData = await request.formData();
		const envVars = JSON.parse(formData.get('envVars') as string);
		const { envVarService } = createServices();
		return await envVarService.saveAndRestart(params.id, envVars);
	}
};
