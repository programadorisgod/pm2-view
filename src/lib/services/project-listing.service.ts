import { createServices } from '$lib/services/factory';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { ProjectFavoriteRepository } from '$lib/db/repositories/project-favorite-repository.impl';
import { TeamRepository } from '$lib/db/repositories/team-repository.impl';
import type { IProjectRepository, Project } from '$lib/projects/project.types';
import type { ITeamRepository } from '$lib/db/repositories/team-repository.interface';
import type { ProcessWithStatus, PM2Process } from '$lib/pm2/pm2.types';
import { PM2Service } from '$lib/pm2/pm2.service';
import { findEcosystemFiles } from '$lib/utils/ecosystem';
import { existsSync } from 'fs';
import { basename } from 'path';
import { WorkspaceDetector } from './project-listing/workspace-detector';
import { ProjectGrouper } from './project-listing/project-grouper';

export interface VisibleProject extends ProcessWithStatus {
	accessType: 'personal' | 'team' | 'shared' | 'admin';
	teamName?: string;
	dbProject?: Project;
	isFavorite?: boolean;
	ecosystemFiles?: string[];
	groupMembers?: ProcessWithStatus[];
	pm2Names?: string[];
}

/**
 * Service that bridges PM2 processes with database access control.
 * Shows DB projects (with targetPath) even when PM2 is not running them.
 */
export class ProjectListingService {
	private static ecosystemCache = new Map<string, { files: string[]; timestamp: number }>();
	private static readonly FS_CACHE_TTL = 30000;
	private static readonly MAX_CACHE_SIZE = 500;

	private static setBoundedCache<T>(map: Map<string, T>, key: string, value: T): void {
		if (map.size >= ProjectListingService.MAX_CACHE_SIZE) {
			const firstKey = map.keys().next().value;
			if (firstKey !== undefined) map.delete(firstKey);
		}
		map.set(key, value);
	}

	constructor(
		private pm2Service: PM2Service,
		private projectRepo: IProjectRepository,
		private teamRepo: ITeamRepository,
		private favoriteRepo: ProjectFavoriteRepository
	) {}

	private async getCachedEcosystemFiles(targetPath: string): Promise<string[]> {
		const now = Date.now();
		const cached = ProjectListingService.ecosystemCache.get(targetPath);
		if (cached && now - cached.timestamp < ProjectListingService.FS_CACHE_TTL) {
			return cached.files;
		}
		const files = await findEcosystemFiles(targetPath);
		ProjectListingService.setBoundedCache(ProjectListingService.ecosystemCache, targetPath, { files, timestamp: now });
		return files;
	}

	/**
	 * Get all projects visible to a user based on their access level.
	 * Shows both PM2 running processes and DB projects with targetPath.
	 * Groups PM2 processes that share a project (via pm2Names).
	 */
	async getVisibleProjects(userId: string, userRole: string): Promise<VisibleProject[]> {
		const isAdmin = userRole === 'admin';

		// 1. Parallelize initial queries without duplicating team queries
		const [rawFavorites, userTeams, processes] = await Promise.all([
			this.favoriteRepo.getUserFavorites(userId),
			this.teamRepo.getUserTeams(userId),
			this.pm2Service.getAllProcesses()
		]);

		const dbProjects = isAdmin
			? await this.projectRepo.getAll()
			: await this.projectRepo.findByAccess({ userId, teamIds: userTeams.map(t => t.id) });

		const favoriteNames = new Set(rawFavorites);
		const teamNameMap = new Map(userTeams.map(t => [t.id, t.name]));

		// Build maps: primary name -> project, and secondary name -> project
		const primaryProjectMap = new Map(dbProjects.map(p => [p.pm2Name, p]));
		const secondaryProjectMap = new Map<string, Project>();

		for (const p of dbProjects) {
			const names = ProjectGrouper.parsePm2Names(p);
			if (names) {
				for (const n of names) {
					if (n !== p.pm2Name) {
						secondaryProjectMap.set(n, p);
					}
				}
			}
		}

		// Pre-compute workspace roots for processes with targetPath or pm_cwd
		const procCwdMap = new Map<string, string>();
		for (const proc of processes) {
			const cwd = (proc.pm2_env?.pm_cwd ?? '').replace(/[/\\]+$/, '');
			if (cwd) procCwdMap.set(proc.name, cwd);
		}

		// Detect and group workspace projects in-memory without synchronous blocking DB writes on read
		for (const p of dbProjects) {
			if (p.pm2Names || !p.targetPath) continue;
			const wsRoot = WorkspaceDetector.getWorkspaceRoot(p.targetPath);
			if (!wsRoot) continue;

			// Find all processes in this workspace
			const wsProcesses = processes.filter(proc => {
				const pCwd = procCwdMap.get(proc.name) ?? '';
				return pCwd.startsWith(wsRoot + '/') || pCwd.startsWith(wsRoot + '\\') || pCwd === wsRoot;
			});
			if (wsProcesses.length <= 1) continue;

			const groupPm2Names = wsProcesses.map(proc => proc.name);
			const wsName = basename(wsRoot);

			p.name = wsName;
			p.pm2Names = JSON.stringify(groupPm2Names);
			p.description = `PM2 group: ${groupPm2Names.join(', ')}`;
			p.targetPath = wsRoot;
			for (const n of groupPm2Names) {
				if (n !== p.pm2Name) secondaryProjectMap.set(n, p);
			}
		}

		// Detect workspace groups among ALL PM2 processes (for users without project access)
		const registeredNames = new Set([
			...Array.from(primaryProjectMap.keys()),
			...Array.from(secondaryProjectMap.keys()),
		]);

		for (const proc of processes) {
			if (registeredNames.has(proc.name)) continue;
			const cwd = procCwdMap.get(proc.name);
			if (!cwd) continue;

			const wsRoot = WorkspaceDetector.getWorkspaceRoot(cwd);
			if (!wsRoot) continue;

			// Find all unregistered processes in this workspace
			const wsProcesses = processes.filter(p => {
				if (registeredNames.has(p.name)) return false;
				const pCwd = procCwdMap.get(p.name) ?? '';
				return pCwd.startsWith(wsRoot + '/') || pCwd.startsWith(wsRoot + '\\') || pCwd === wsRoot;
			});
			if (wsProcesses.length <= 1) continue;

			// Create a synthetic project entry for this workspace group
			const groupPm2Names = wsProcesses.map(p => p.name);
			const wsName = basename(wsRoot);
			const syntheticProject: Project = {
				id: `ws:${wsRoot}`,
				userId: '',
				name: wsName,
				pm2Name: groupPm2Names[0],
				description: `PM2 group: ${groupPm2Names.join(', ')}`,
				targetPath: wsRoot,
				teamId: null,
				githubRepo: null,
				deployBranch: 'main',
				autoDeployEnabled: false,
				notifyEmail: null,
				createdAt: new Date(),
				pm2Names: JSON.stringify(groupPm2Names),
			};

			// Add to maps so the main loop picks them up
			for (const n of groupPm2Names) {
				if (n !== syntheticProject.pm2Name) secondaryProjectMap.set(n, syntheticProject);
				registeredNames.add(n);
			}
			primaryProjectMap.set(syntheticProject.pm2Name, syntheticProject);
		}

		// Group processes by their project ID
		const projectProcessMap = new Map<string, { project: Project; processes: ProcessWithStatus[] }>();
		const unmatchedProcesses: ProcessWithStatus[] = [];

		for (const proc of processes) {
			// Check group (secondary) first — groups take precedence over individual registrations
			const dbProject = secondaryProjectMap.get(proc.name) ?? primaryProjectMap.get(proc.name);

			if (dbProject) {
				const existing = projectProcessMap.get(dbProject.id);
				const statusProc = ProjectGrouper.toProcessWithStatus(proc);
				if (existing) {
					existing.processes.push(statusProc);
				} else {
					projectProcessMap.set(dbProject.id, {
						project: dbProject,
						processes: [statusProc]
					});
				}
			} else {
				unmatchedProcesses.push(ProjectGrouper.toProcessWithStatus(proc));
			}
		}

		// Build results from grouped projects
		const results: VisibleProject[] = [];

		for (const [_, { project: dbProject, processes: groupProcesses }] of projectProcessMap) {
			const accessType = ProjectGrouper.determineAccessType(dbProject, userId);
			const teamName = dbProject.teamId ? teamNameMap.get(dbProject.teamId) : undefined;
			const primary = groupProcesses[0];
			const worstStatus = ProjectGrouper.getWorstStatus(groupProcesses);

			// Single pass over groupProcesses for metrics
			let totalCpu = 0;
			let totalMemory = 0;
			for (let i = 0; i < groupProcesses.length; i++) {
				totalCpu += groupProcesses[i].cpu;
				totalMemory += groupProcesses[i].memoryMB;
			}

			const pm2Names = ProjectGrouper.parsePm2Names(dbProject);

			results.push({
				...primary,
				name: dbProject.name || primary.name,
				status: worstStatus,
				cpu: Math.round(totalCpu / groupProcesses.length),
				memoryMB: totalMemory,
				accessType,
				teamName,
				dbProject,
				isFavorite: favoriteNames.has(dbProject.pm2Name),
				groupMembers: groupProcesses.length > 1 ? groupProcesses : undefined,
				pm2Names,
			});
		}

		// Group unmatched PM2 processes by workspace root (monorepo detection)
		const workspaceGroups = new Map<string, ProcessWithStatus[]>();
		const stillUnmatched: ProcessWithStatus[] = [];

		for (const proc of unmatchedProcesses) {
			const cwd = proc.pm2_env?.pm_cwd;
			const root = cwd ? WorkspaceDetector.getWorkspaceRoot(cwd) : null;
			if (root) {
				const list = workspaceGroups.get(root) ?? [];
				list.push(proc);
				workspaceGroups.set(root, list);
			} else {
				stillUnmatched.push(proc);
			}
		}

		// Add monorepo groups as single visible entries (admin only)
		if (isAdmin) {
			for (const [root, groupProcesses] of workspaceGroups) {
				if (groupProcesses.length > 1) {
					const primary = groupProcesses[0];
					const worstStatus = ProjectGrouper.getWorstStatus(groupProcesses);
					let totalCpu = 0;
					let totalMemory = 0;
					for (let i = 0; i < groupProcesses.length; i++) {
						totalCpu += groupProcesses[i].cpu;
						totalMemory += groupProcesses[i].memoryMB;
					}
					const groupPm2Names = groupProcesses.map(p => p.name);

					results.push({
						...primary,
						name: basename(root),
						status: worstStatus,
						cpu: Math.round(totalCpu / groupProcesses.length),
						memoryMB: totalMemory,
						accessType: 'personal',
						isFavorite: groupPm2Names.some(n => favoriteNames.has(n)),
						groupMembers: groupProcesses,
						pm2Names: groupPm2Names,
					});
				} else {
					stillUnmatched.push(groupProcesses[0]);
				}
			}

			// Add remaining unmatched processes as individual entries (admin only)
			for (const proc of stillUnmatched) {
				results.push({
					...proc,
					accessType: 'personal',
					isFavorite: favoriteNames.has(proc.name),
				});
			}
		}

		// Add DB projects with targetPath that are NOT in PM2
		const registeredPm2Names = new Set(processes.map(p => p.name));
		const offlineProjects = dbProjects
			.filter(dbProject => {
				if (projectProcessMap.has(dbProject.id)) return false;
				const allNames = ProjectGrouper.parsePm2Names(dbProject) ?? [dbProject.pm2Name];
				const hasRunningProcess = allNames.some(n => registeredPm2Names.has(n));
				return !hasRunningProcess && dbProject.targetPath;
			})
			.filter(dbProject => dbProject.targetPath && existsSync(dbProject.targetPath));

		// Parallelize filesystem checks for ecosystem files with caching
		const ecosystemResults = await Promise.all(
			offlineProjects.map(async (dbProject) => ({
				dbProject,
				ecosystemFiles: await this.getCachedEcosystemFiles(dbProject.targetPath!)
			}))
		);

		for (const { dbProject, ecosystemFiles } of ecosystemResults) {
			if (ecosystemFiles.length === 0) continue;

			const accessType = ProjectGrouper.determineAccessType(dbProject, userId);
			const teamName = dbProject.teamId ? teamNameMap.get(dbProject.teamId) : undefined;
			const pm2Names = ProjectGrouper.parsePm2Names(dbProject);

			// Create synthetic ProcessWithStatus for offline project
			results.push({
				name: dbProject.name || dbProject.pm2Name,
				pm_id: -1,
				monit: { cpu: 0, memory: 0 },
				pm2_env: {
					status: 'stopped',
					pm_uptime: 0,
					restart_time: 0,
					pm_cwd: dbProject.targetPath ?? undefined,
				},
				status: 'offline',
				cpu: 0,
				memoryMB: 0,
				uptimeFormatted: 'Not running',
				accessType,
				teamName,
				dbProject,
				isFavorite: favoriteNames.has(dbProject.pm2Name),
				ecosystemFiles,
				pm2Names,
			});
		}

		return results;
	}
}

/**
 * Factory function to create ProjectListingService with default dependencies.
 */
export function createProjectListingService(): ProjectListingService {
	const { pm2Service } = createServices();
	const projectRepo = new ProjectRepository();
	const teamRepo = new TeamRepository();
	const favoriteRepo = new ProjectFavoriteRepository();

	return new ProjectListingService(pm2Service, projectRepo, teamRepo, favoriteRepo);
}
