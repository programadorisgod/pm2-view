import { createServices } from '$lib/services/factory';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { ProjectFavoriteRepository } from '$lib/db/repositories/project-favorite-repository.impl';
import { TeamRepository } from '$lib/db/repositories/team-repository.impl';
import type { IProjectRepository, Project } from '$lib/projects/project.types';
import type { ITeamRepository, Team } from '$lib/db/repositories/team-repository.interface';
import type { ProcessWithStatus } from '$lib/pm2/pm2.types';
import { PM2Service } from '$lib/pm2/pm2.service';

export interface VisibleProject extends ProcessWithStatus {
	accessType: 'personal' | 'team' | 'shared' | 'admin';
	teamName?: string;
	dbProject?: Project;
	isFavorite?: boolean;
}

/**
 * Service that bridges PM2 processes with database access control.
 * Filters PM2 processes to only show projects the user has access to.
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
	 * Admin users see all processes.
	 * Regular users see: personal + team + shared projects.
	 */
	async getVisibleProjects(userId: string, userRole: string): Promise<VisibleProject[]> {
		// Get user's favorites
		const favoriteNames = new Set(await this.favoriteRepo.getUserFavorites(userId));

		// Admin sees all processes
		if (userRole === 'admin') {
			const processes = await this.pm2Service.getAllProcesses();
			return processes.map(p => ({
				...p,
				accessType: 'admin' as const,
				isFavorite: favoriteNames.has(p.name)
			}));
		}

		// Get user's team memberships
		const userTeams = await this.teamRepo.getUserTeams(userId);
		const teamIds = userTeams.map(t => t.id);
		const teamNameMap = new Map(userTeams.map(t => [t.id, t.name]));

		// Get accessible projects from DB
		const dbProjects = await this.projectRepo.findByAccess({ userId, teamIds });
		const dbProjectMap = new Map(dbProjects.map(p => [p.pm2Name, p]));

		// Get PM2 processes and filter by matching pm2Name
		const processes = await this.pm2Service.getAllProcesses();

		return processes
			.filter(p => dbProjectMap.has(p.name))
			.map(p => {
				const dbProject = dbProjectMap.get(p.name);
				const accessType = this.determineAccessType(p, dbProject, userId);
				const teamName = dbProject?.teamId ? teamNameMap.get(dbProject.teamId) : undefined;

				return {
					...p,
					accessType,
					teamName,
					dbProject,
					isFavorite: favoriteNames.has(p.name)
				};
			});
	}

	private determineAccessType(
		pm2Process: ProcessWithStatus,
		dbProject: Project | undefined,
		userId: string
	): 'personal' | 'team' | 'shared' {
		if (!dbProject) return 'personal'; // Fallback
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
