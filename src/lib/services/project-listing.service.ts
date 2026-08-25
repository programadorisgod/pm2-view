import { createServices } from '$lib/services/factory';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { ProjectFavoriteRepository } from '$lib/db/repositories/project-favorite-repository.impl';
import { TeamRepository } from '$lib/db/repositories/team-repository.impl';
import type { IProjectRepository, Project } from '$lib/projects/project.types';
import type { ITeamRepository, Team } from '$lib/db/repositories/team-repository.interface';
import type { ProcessWithStatus } from '$lib/pm2/pm2.types';
import { PM2Service } from '$lib/pm2/pm2.service';
import { findEcosystemFiles } from '$lib/utils/ecosystem';
import { existsSync } from 'fs';

export interface VisibleProject extends ProcessWithStatus {
	accessType: 'personal' | 'team' | 'shared' | 'admin';
	teamName?: string;
	dbProject?: Project;
	isFavorite?: boolean;
	ecosystemFiles?: string[];
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
		const dbProjectMap = new Map(dbProjects.map(p => [p.pm2Name, p]));

		// Get PM2 processes
		const processes = await this.pm2Service.getAllProcesses();
		const pm2Names = new Set(processes.map(p => p.name));

		// Start with PM2 processes that match DB projects
		const results: VisibleProject[] = processes
			.filter(p => dbProjectMap.has(p.name))
			.map(p => {
				const dbProject = dbProjectMap.get(p.name);
				const accessType = this.determineAccessType(dbProject, userId);
				const teamName = dbProject?.teamId ? teamNameMap.get(dbProject.teamId) : undefined;

				return {
					...p,
					accessType,
					teamName,
					dbProject,
					isFavorite: favoriteNames.has(p.name)
				};
			});

		// Add DB projects with targetPath that are NOT in PM2
		const offlineProjects = dbProjects
			.filter(dbProject => !pm2Names.has(dbProject.pm2Name) && dbProject.targetPath)
			.filter(dbProject => existsSync(dbProject.targetPath));

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

			// Create synthetic ProcessWithStatus for offline project
			results.push({
				name: dbProject.pm2Name,
				pm_id: -1,
				monit: { cpu: 0, memory: 0 },
				pm2_env: {
					status: 'stopped',
					pm_uptime: 0,
					restart_time: 0,
					pm_cwd: dbProject.targetPath,
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
			});
		}

		return results;
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
