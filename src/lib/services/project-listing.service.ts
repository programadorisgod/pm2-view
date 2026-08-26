import { createServices } from '$lib/services/factory';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { ProjectFavoriteRepository } from '$lib/db/repositories/project-favorite-repository.impl';
import { TeamRepository } from '$lib/db/repositories/team-repository.impl';
import type { IProjectRepository, Project } from '$lib/projects/project.types';
import type { ITeamRepository, Team } from '$lib/db/repositories/team-repository.interface';
import type { ProcessWithStatus, PM2Process } from '$lib/pm2/pm2.types';
import { PM2Service } from '$lib/pm2/pm2.service';
import { findEcosystemFiles } from '$lib/utils/ecosystem';
import { existsSync, readFileSync } from 'fs';
import { join, basename, dirname } from 'path';

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
	constructor(
		private pm2Service: PM2Service,
		private projectRepo: IProjectRepository,
		private teamRepo: ITeamRepository,
		private favoriteRepo: ProjectFavoriteRepository
	) {}

	/**
	 * Get all projects visible to a user based on their access level.
	 * Shows both PM2 running processes and DB projects with targetPath.
	 * Groups PM2 processes that share a project (via pm2Names).
	 */
	async getVisibleProjects(userId: string, userRole: string): Promise<VisibleProject[]> {
		// Get user's favorites
		const favoriteNames = new Set(await this.favoriteRepo.getUserFavorites(userId));

		// Get user's team memberships
		const userTeams = await this.teamRepo.getUserTeams(userId);
		const teamIds = userTeams.map(t => t.id);
		const teamNameMap = new Map(userTeams.map(t => [t.id, t.name]));

		// Get accessible projects from DB
		const dbProjects = userRole === 'admin'
			? await this.projectRepo.getAll()
			: await this.projectRepo.findByAccess({ userId, teamIds });

		// Build maps: primary name -> project, and secondary name -> project
		const primaryProjectMap = new Map(dbProjects.map(p => [p.pm2Name, p]));
		const secondaryProjectMap = new Map<string, Project>();
		for (const p of dbProjects) {
			if (p.pm2Names) {
				try {
					const names = JSON.parse(p.pm2Names) as string[];
					for (const n of names) {
						if (n !== p.pm2Name) {
							secondaryProjectMap.set(n, p);
						}
					}
				} catch { /* ignore */ }
			}
		}

		// Get PM2 processes
		const processes = await this.pm2Service.getAllProcesses();

		// Group processes by their project ID
		const projectProcessMap = new Map<string, { project: Project; processes: ProcessWithStatus[] }>();
		const unmatchedProcesses: ProcessWithStatus[] = [];

		for (const proc of processes) {
			// Check group (secondary) first — groups take precedence over individual registrations
			let dbProject = secondaryProjectMap.get(proc.name);
			if (!dbProject) {
				// Check primary (individual) match
				dbProject = primaryProjectMap.get(proc.name);
			}

			if (dbProject) {
				const existing = projectProcessMap.get(dbProject.id);
				if (existing) {
					existing.processes.push(this.toProcessWithStatus(proc));
				} else {
					projectProcessMap.set(dbProject.id, {
						project: dbProject,
						processes: [this.toProcessWithStatus(proc)]
					});
				}
			} else {
				unmatchedProcesses.push(this.toProcessWithStatus(proc));
			}
		}

		// Build results from grouped projects
		const results: VisibleProject[] = [];

		for (const [_, { project: dbProject, processes: groupProcesses }] of projectProcessMap) {
			const accessType = this.determineAccessType(dbProject, userId);
			const teamName = dbProject.teamId ? teamNameMap.get(dbProject.teamId) : undefined;

			// Use the first process (primary) as the main entry
			const primary = groupProcesses[0];
			const worstStatus = this.getWorstStatus(groupProcesses);

			// Aggregate CPU and memory
			const totalCpu = groupProcesses.reduce((sum, p) => sum + p.cpu, 0);
			const totalMemory = groupProcesses.reduce((sum, p) => sum + p.memoryMB, 0);

			// Parse pm2Names from dbProject
			const pm2Names = this.parsePm2Names(dbProject);

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
		const WORKSPACE_INDICATORS = [
			'pnpm-workspace.yaml', 'lerna.json', 'nx.json',
			'turbo.json', 'rush.json', '.yarnrc.yml',
		];

		function findWorkspaceRoot(startDir: string): string | null {
			let dir = startDir.replace(/\/+$/, '');
			for (let i = 0; i < 4; i++) {
				for (const file of WORKSPACE_INDICATORS) {
					if (existsSync(join(dir, file))) return dir;
				}
				const pkgPath = join(dir, 'package.json');
				if (existsSync(pkgPath)) {
					try {
						const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
						if (pkg.workspaces) return dir;
					} catch { /* ignore */ }
				}
				const parent = dirname(dir);
				if (parent === dir) break;
				dir = parent;
			}
			return null;
		}

		// Detect monorepo groups among unmatched processes
		const workspaceGroups = new Map<string, ProcessWithStatus[]>();
		const stillUnmatched: ProcessWithStatus[] = [];

		for (const proc of unmatchedProcesses) {
			const cwd = proc.pm2_env?.pm_cwd ?? '';
			const root = cwd ? findWorkspaceRoot(cwd) : null;
			if (root) {
				const list = workspaceGroups.get(root) ?? [];
				list.push(proc);
				workspaceGroups.set(root, list);
			} else {
				stillUnmatched.push(proc);
			}
		}

		// Add monorepo groups as single visible entries
		for (const [root, groupProcesses] of workspaceGroups) {
			if (groupProcesses.length > 1) {
				const primary = groupProcesses[0];
				const worstStatus = this.getWorstStatus(groupProcesses);
				const totalCpu = groupProcesses.reduce((sum, p) => sum + p.cpu, 0);
				const totalMemory = groupProcesses.reduce((sum, p) => sum + p.memoryMB, 0);
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

		// Add remaining unmatched processes as individual entries
		for (const proc of stillUnmatched) {
			results.push({
				...proc,
				accessType: 'personal',
				isFavorite: favoriteNames.has(proc.name),
			});
		}

		// Add DB projects with targetPath that are NOT in PM2
		// A project is "offline" if none of its pm2Names appear in running PM2 processes
		const registeredPm2Names = new Set(processes.map(p => p.name));
		const offlineProjects = dbProjects
			.filter(dbProject => {
				// Skip projects already represented in projectProcessMap
				if (projectProcessMap.has(dbProject.id)) return false;
				// Check if any process name in the group is running
				const allNames = this.parsePm2Names(dbProject) ?? [dbProject.pm2Name];
				const hasRunningProcess = allNames.some(n => registeredPm2Names.has(n));
				return !hasRunningProcess && dbProject.targetPath;
			})
			.filter(dbProject => dbProject.targetPath && existsSync(dbProject.targetPath));

		// Parallelize filesystem checks for ecosystem files
		const ecosystemResults = await Promise.all(
			offlineProjects.map(async (dbProject) => ({
				dbProject,
				ecosystemFiles: await findEcosystemFiles(dbProject.targetPath!)
			}))
		);

		for (const { dbProject, ecosystemFiles } of ecosystemResults) {
			if (ecosystemFiles.length === 0) continue;

			const accessType = this.determineAccessType(dbProject, userId);
			const teamName = dbProject.teamId ? teamNameMap.get(dbProject.teamId) : undefined;
			const pm2Names = this.parsePm2Names(dbProject);

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

	private parsePm2Names(dbProject: Project): string[] | undefined {
		if (!dbProject.pm2Names) return undefined;
		try {
			const parsed = JSON.parse(dbProject.pm2Names) as unknown;
			if (Array.isArray(parsed) && parsed.length > 0) {
				return parsed as string[];
			}
		} catch { /* ignore */ }
		return undefined;
	}

	private toProcessWithStatus(proc: PM2Process): ProcessWithStatus {
		return {
			...proc,
			status: this.mapStatus(proc.pm2_env?.status),
			cpu: proc.monit?.cpu ?? 0,
			memoryMB: Math.round((proc.monit?.memory ?? 0) / 1024 / 1024),
			uptimeFormatted: this.formatUptime(proc.pm2_env?.pm_uptime),
		};
	}

	private mapStatus(pm2Status: string | undefined): ProcessWithStatus['status'] {
		switch (pm2Status) {
			case 'online':
			case 'launching':
				return 'online';
			case 'stopped':
			case 'stopping':
				return 'stopped';
			case 'errored':
			case 'error':
			case 'waiting restart':
				return 'error';
			default:
				return 'offline';
		}
	}

	private getWorstStatus(processes: ProcessWithStatus[]): 'online' | 'stopped' | 'error' | 'offline' {
		if (processes.some(p => p.status === 'error')) return 'error';
		if (processes.some(p => p.status === 'stopped')) return 'stopped';
		if (processes.every(p => p.status === 'online')) return 'online';
		return 'offline';
	}

	private formatUptime(uptimeMs?: number): string {
		if (!uptimeMs) return 'Unknown';
		const seconds = Math.floor((Date.now() - uptimeMs) / 1000);
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (days > 0) return `${days}d ${hours}h`;
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	private determineAccessType(
		dbProject: Project | undefined,
		userId: string
	): 'personal' | 'team' | 'shared' {
		if (!dbProject) return 'personal';
		if (dbProject.teamId) return 'team';
		if (dbProject.userId === userId) return 'personal';
		return 'shared';
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
